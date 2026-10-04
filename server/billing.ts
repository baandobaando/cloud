import crypto from 'node:crypto'
import { Router } from 'express'
import {
  DURATIONS,
  MEMBERSHIP,
  getPlan,
  priceFor,
  type BillingConfig,
  type OrderStatus,
  type OrderView,
  type PaymentProviderId,
} from '../shared/types.ts'
import { requireUser } from './auth.ts'
import { config } from './config.ts'
import { db, transaction } from './db.ts'
import { HttpError, int, rateLimit, str } from './http.ts'
import { getSubscription } from './models.ts'
import { btcpay } from './payments/btcpay.ts'
import { nowpayments } from './payments/nowpayments.ts'
import { testProvider } from './payments/test.ts'
import { WebhookSignatureError, type PaymentProvider } from './payments/types.ts'

const PROVIDERS: PaymentProvider[] = [nowpayments, btcpay, testProvider]
const DAY_MS = 24 * 60 * 60 * 1000
/** Unpaid orders are treated as expired after this long. */
const ORDER_TTL_MS = DAY_MS
/** Minimum gap between status lookups against a processor for the same order. */
const STATUS_POLL_MS = 15_000

function provider(id: string): PaymentProvider {
  const p = PROVIDERS.find((x) => x.info.id === id && x.isConfigured())
  if (!p) throw new HttpError(400, 'That payment method is not available')
  return p
}

interface OrderRow {
  id: string
  user_id: number
  plan: string
  months: number
  amount_cents: number
  provider: string
  provider_invoice_id: string | null
  checkout_url: string | null
  status: OrderStatus
  pay_currency: string | null
  created_at: number
  paid_at: number | null
}

function toOrderView(o: OrderRow): OrderView {
  const stale = (o.status === 'pending') && Date.now() - o.created_at > ORDER_TTL_MS
  return {
    id: o.id,
    plan: o.plan as OrderView['plan'],
    months: o.months,
    amountCents: o.amount_cents,
    provider: o.provider as PaymentProviderId,
    status: stale ? 'expired' : o.status,
    checkoutUrl: o.checkout_url,
    createdAt: o.created_at,
    paidAt: o.paid_at,
  }
}

const getOrder = (id: string) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined

/**
 * Marks an order paid and extends the buyer's access. Idempotent: processors retry webhooks,
 * so a second "paid" notification for the same order does nothing.
 */
export function fulfillOrder(orderId: string, payCurrency?: string): boolean {
  return transaction(() => {
    const now = Date.now()
    const { changes } = db
      .prepare(
        `UPDATE orders SET status = 'paid', paid_at = ?, pay_currency = COALESCE(?, pay_currency)
         WHERE id = ? AND status != 'paid'`,
      )
      .run(now, payCurrency ?? null, orderId)
    if (changes === 0) return false

    const order = getOrder(orderId)!
    const current = getSubscription(order.user_id)
    const source = order.provider === 'test' ? 'test' : 'crypto'

    if (current && current.currentPeriodEnd === null) {
      // Already has open-ended complimentary access; just switch the plan.
      db.prepare('UPDATE subscriptions SET plan = ?, updated_at = ? WHERE user_id = ?').run(order.plan, now, order.user_id)
    } else {
      // Stack the new pass on top of any time remaining.
      const base = current?.currentPeriodEnd && current.currentPeriodEnd > now ? current.currentPeriodEnd : now
      const end = base + order.months * 30 * DAY_MS
      db.prepare(
        `INSERT INTO subscriptions (user_id, plan, current_period_end, source, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, current_period_end = excluded.current_period_end,
           source = excluded.source, updated_at = excluded.updated_at`,
      ).run(order.user_id, order.plan, end, source, now)
    }

    db.prepare(
      'INSERT INTO payments (user_id, amount_cents, currency, plan, provider, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(order.user_id, order.amount_cents, 'usd', order.plan, order.provider, order.id, now)
    console.log(`[billing] Order ${order.id} paid: user ${order.user_id}, ${order.plan} × ${order.months}mo`)
    return true
  })
}

function applyStatus(order: OrderRow, status: OrderStatus, payCurrency?: string) {
  if (order.status === 'paid') return
  if (status === 'paid') {
    fulfillOrder(order.id, payCurrency)
  } else if (status !== order.status) {
    db.prepare('UPDATE orders SET status = ?, pay_currency = COALESCE(?, pay_currency) WHERE id = ?').run(
      status,
      payCurrency ?? null,
      order.id,
    )
  }
}

export const billingRouter = Router()

billingRouter.get('/config', (_req, res) => {
  const body: BillingConfig = { providers: PROVIDERS.filter((p) => p.isConfigured()).map((p) => p.info) }
  res.json(body)
})

// ----- Webhooks (raw body, no session) -----

for (const p of [nowpayments, btcpay]) {
  billingRouter.post(`/webhooks/${p.info.id}`, async (req, res) => {
    if (!p.isConfigured()) throw new HttpError(404, 'Not configured')
    if (!Buffer.isBuffer(req.body)) throw new HttpError(400, 'Expected raw body')
    let result
    try {
      result = await p.parseWebhook(req.body, req.headers)
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        console.warn(`[billing] Rejected ${p.info.id} webhook: ${err.message}`)
        throw new HttpError(401, 'Invalid signature')
      }
      throw err
    }
    if (result) {
      const order =
        (result.orderId && getOrder(result.orderId)) ||
        (result.invoiceId &&
          (db
            .prepare('SELECT * FROM orders WHERE provider = ? AND provider_invoice_id = ?')
            .get(p.info.id, result.invoiceId) as OrderRow | undefined))
      if (!order || order.provider !== p.info.id) {
        console.warn(`[billing] ${p.info.id} webhook for unknown order`, result)
      } else if (result.status === 'paid' && result.amountCents !== undefined && result.amountCents < order.amount_cents) {
        console.warn(`[billing] Order ${order.id} amount mismatch: got ${result.amountCents}, expected ${order.amount_cents}`)
      } else {
        applyStatus(order, result.status, result.payCurrency)
      }
    }
    res.json({ ok: true })
  })
}

// ----- Signed-in routes -----

billingRouter.use(requireUser)

billingRouter.post('/orders', rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }), async (req, res) => {
  const plan = req.body?.plan ? getPlan(String(req.body.plan)) : MEMBERSHIP
  if (!plan) throw new HttpError(400, 'Unknown plan')
  const months = int(req.body?.months, 'Duration')
  if (!DURATIONS.some((d) => d.months === months)) throw new HttpError(400, 'Unsupported duration')
  const p = provider(str(req.body?.provider, 'Payment method'))

  const id = crypto.randomUUID()
  const amountCents = priceFor(plan, months)
  const now = Date.now()
  db.prepare(
    `INSERT INTO orders (id, user_id, plan, months, amount_cents, provider, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(id, req.user!.id, plan.id, months, amountCents, p.info.id, now)

  try {
    const { invoiceId, checkoutUrl } = await p.createInvoice({
      orderId: id,
      amountCents,
      description: `ReelFlix membership — ${months} month${months > 1 ? 's' : ''}`,
      returnUrl: `${config.appUrl}/billing/order/${id}`,
    })
    db.prepare('UPDATE orders SET provider_invoice_id = ?, checkout_url = ? WHERE id = ?').run(invoiceId, checkoutUrl, id)
    res.status(201).json({ orderId: id, checkoutUrl })
  } catch (err) {
    db.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").run(id)
    console.error('[billing] createInvoice failed', err)
    throw new HttpError(502, 'Could not start checkout with the payment processor. Please try again.')
  }
})

billingRouter.get('/orders', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user!.id) as unknown as OrderRow[]
  res.json(rows.map(toOrderView))
})

const lastPolled = new Map<string, number>()

billingRouter.get('/orders/:id', async (req, res) => {
  let order = getOrder(req.params.id)
  if (!order || order.user_id !== req.user!.id) throw new HttpError(404, 'Order not found')

  // Fallback for missed webhooks: ask the processor directly (throttled).
  const p = PROVIDERS.find((x) => x.info.id === order!.provider)
  const pending = order.status === 'pending' || order.status === 'confirming'
  if (p?.isConfigured() && pending && order.provider_invoice_id && Date.now() - (lastPolled.get(order.id) ?? 0) > STATUS_POLL_MS) {
    lastPolled.set(order.id, Date.now())
    const status = await p.fetchStatus(order.provider_invoice_id).catch(() => null)
    if (status) {
      applyStatus(order, status)
      order = getOrder(order.id)!
    }
  }
  res.json(toOrderView(order))
})

/** Test provider only: simulate the processor confirming payment. */
billingRouter.post('/test/:id/pay', (req, res) => {
  if (!config.allowTestBilling) throw new HttpError(404, 'Not found')
  const order = getOrder(req.params.id as string)
  if (!order || order.user_id !== req.user!.id || order.provider !== 'test') throw new HttpError(404, 'Order not found')
  if (toOrderView(order).status === 'expired') throw new HttpError(400, 'This order has expired')
  fulfillOrder(order.id, 'TEST')
  res.json({ ok: true })
})
