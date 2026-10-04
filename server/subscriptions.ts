import crypto from 'node:crypto'
import { Router } from 'express'
import { MEMBERSHIP, TRIAL_DAYS } from '../shared/types.ts'
import { requireUser } from './auth.ts'
import { config } from './config.ts'
import { db, transaction } from './db.ts'
import { HttpError, rateLimit } from './http.ts'
import { LIVE_SUBSCRIPTION_STATUSES, getSubscription } from './models.ts'
import { stripe, stripeProvider } from './payments/stripe.ts'

/**
 * Monthly memberships through Stripe Billing. Stripe owns the schedule (trial, monthly charges, retries, cancellation);
 * we mirror the subscription onto the member's `subscriptions` row from webhooks, so access always follows Stripe.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export interface StripeSubscription {
  id: string
  customer: string
  status: string
  cancel_at_period_end?: boolean
  /** Top-level on older API versions; on newer ones it lives on the subscription item. */
  current_period_end?: number
  items?: { data?: { current_period_end?: number }[] }
  trial_end?: number | null
  ended_at?: number | null
  metadata?: Record<string, string>
}

interface StripeInvoice {
  id: string
  amount_paid: number
  currency?: string
  /** Older API versions. */
  subscription?: string | null
  /** Newer API versions. */
  parent?: { subscription_details?: { subscription?: string } | null } | null
}

/** Whether this account may still start a free trial (one per account, never after paying). */
export function trialEligible(userId: number): boolean {
  const u = db.prepare('SELECT trial_used_at FROM users WHERE id = ?').get(userId) as { trial_used_at: number | null } | undefined
  if (!u || u.trial_used_at) return false
  const hadSub = db.prepare('SELECT 1 FROM subscriptions WHERE user_id = ? AND stripe_subscription_id IS NOT NULL').get(userId)
  const paid = db.prepare("SELECT 1 FROM payments WHERE user_id = ? AND COALESCE(provider, '') != 'test'").get(userId)
  return !hadSub && !paid
}

/**
 * Copies a Stripe subscription onto the member's row: access lasts to the end of the paid (or trial) period while the
 * subscription is live, and ends when Stripe ends it. Returns the user id, or null if it can't be matched to a user.
 */
export function applyStripeSubscription(s: StripeSubscription): number | null {
  const linked = db.prepare('SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ?').get(s.id) as { user_id: number } | undefined
  const userId = linked?.user_id ?? (Number(s.metadata?.user_id) || null)
  if (!userId || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) return null

  const now = Date.now()
  const live = LIVE_SUBSCRIPTION_STATUSES.includes(s.status)
  const periodEnd = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? 0
  const end = live ? Math.max(periodEnd, s.trial_end ?? 0) * 1000 || now + 30 * DAY_MS : (s.ended_at ?? now / 1000) * 1000
  transaction(() => {
    db.prepare(
      `INSERT INTO subscriptions (user_id, plan, current_period_end, source, updated_at, stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end, trial_end)
       VALUES (?, ?, ?, 'card', ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, current_period_end = excluded.current_period_end, source = 'card',
         updated_at = excluded.updated_at, stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id,
         status = excluded.status, cancel_at_period_end = excluded.cancel_at_period_end, trial_end = excluded.trial_end`,
    ).run(userId, MEMBERSHIP.id, Math.round(end), now, s.customer, s.id, s.status, s.cancel_at_period_end ? 1 : 0, s.trial_end ? s.trial_end * 1000 : null)
    if (s.status === 'trialing' || s.trial_end) db.prepare('UPDATE users SET trial_used_at = COALESCE(trial_used_at, ?) WHERE id = ?').run(now, userId)
  })
  return userId
}

const fetchSubscription = (id: string) => stripe<StripeSubscription>(`/subscriptions/${encodeURIComponent(id)}`)

/** Records a paid invoice (first charge after the trial, and every renewal) as a payment, once. */
async function recordInvoice(inv: StripeInvoice) {
  const subId = inv.subscription ?? inv.parent?.subscription_details?.subscription
  if (!subId) return
  const userId = applyStripeSubscription(await fetchSubscription(subId))
  if (!userId || !inv.amount_paid) return
  db.prepare(
    `INSERT INTO payments (user_id, amount_cents, currency, plan, provider, provider_ref, created_at) VALUES (?, ?, ?, ?, 'stripe', ?, ?)
     ON CONFLICT DO NOTHING`,
  ).run(userId, inv.amount_paid, inv.currency ?? 'usd', MEMBERSHIP.id, inv.id, Date.now())
  console.log(`[billing] Subscription invoice ${inv.id} paid: user ${userId}, ${inv.amount_paid}c`)
}

/**
 * Finishes the checkout that started a subscription: marks its order paid and links the subscription to the member.
 * Safe to call more than once (webhook and the order page's status check can both get here).
 */
export async function completeSubscriptionOrder(orderId: string, sessionId: string) {
  const session = await stripe<{ subscription?: string | null; customer?: string | null; status?: string }>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
  )
  if (session.status !== 'complete' || !session.subscription) return
  const sub = await fetchSubscription(session.subscription)
  applyStripeSubscription({ ...sub, metadata: { ...sub.metadata, user_id: sub.metadata?.user_id ?? String(orderUser(orderId)) } })
  db.prepare("UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?), pay_currency = 'CARD' WHERE id = ?").run(Date.now(), orderId)
}

const orderUser = (orderId: string) => (db.prepare('SELECT user_id FROM orders WHERE id = ?').get(orderId) as { user_id: number } | undefined)?.user_id

/** Handles subscription lifecycle webhooks (the signature has already been verified). */
export async function handleSubscriptionEvent(event: { type?: string; data?: { object?: unknown } }) {
  const obj = event.data?.object
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      applyStripeSubscription(obj as StripeSubscription)
      break
    case 'invoice.paid':
      await recordInvoice(obj as StripeInvoice)
      break
  }
}

// ----- Routes (mounted under /api/billing) -----

export const subscriptionRouter = Router()
subscriptionRouter.use(requireUser)

/** Starts Stripe Checkout for the monthly membership, with the free trial when the account still has one. */
subscriptionRouter.post('/subscription', rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }), async (req, res) => {
  if (!stripeProvider.isConfigured()) throw new HttpError(400, 'Subscriptions are not available right now. Please try again soon.')
  const userId = req.user!.id
  const current = getSubscription(userId)
  if (current?.renews || current?.cancelAtPeriodEnd) throw new HttpError(400, 'You already have a subscription. Manage it from your account page.')
  if (current && current.currentPeriodEnd === null) throw new HttpError(400, 'Your account already has access with no end date.')

  const trial = trialEligible(userId)
  // Time left on a prepaid pass isn't charged for: the first monthly charge waits until it runs out.
  const passEnd = current?.currentPeriodEnd && current.currentPeriodEnd > Date.now() + 2 * DAY_MS ? current.currentPeriodEnd : null
  const id = crypto.randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO orders (id, user_id, plan, months, amount_cents, provider, status, created_at, kind)
     VALUES (?, ?, ?, 1, ?, 'stripe', 'pending', ?, 'subscription')`,
  ).run(id, userId, MEMBERSHIP.id, trial || passEnd ? 0 : MEMBERSHIP.priceCents, now)

  const existing = db.prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?').get(userId) as { stripe_customer_id: string | null } | undefined
  const form: Record<string, string> = {
    mode: 'subscription',
    success_url: `${config.appUrl}/billing/order/${id}`,
    cancel_url: `${config.appUrl}/plans`,
    client_reference_id: id,
    'metadata[order_id]': id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(MEMBERSHIP.priceCents),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': 'BingeTube membership',
    'subscription_data[metadata][user_id]': String(userId),
    'subscription_data[metadata][order_id]': id,
    allow_promotion_codes: 'true',
  }
  if (passEnd) form['subscription_data[trial_end]'] = String(Math.floor(passEnd / 1000))
  else if (trial) form['subscription_data[trial_period_days]'] = String(TRIAL_DAYS)
  if (existing?.stripe_customer_id) form.customer = existing.stripe_customer_id
  else form.customer_email = req.user!.email

  try {
    const session = await stripe<{ id: string; url?: string | null }>('/checkout/sessions', form)
    if (!session.url) throw new Error('No checkout URL')
    db.prepare('UPDATE orders SET provider_invoice_id = ?, checkout_url = ? WHERE id = ?').run(session.id, session.url, id)
    res.status(201).json({ orderId: id, checkoutUrl: session.url })
  } catch (err) {
    db.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").run(id)
    console.error('[billing] subscription checkout failed', err)
    throw new HttpError(502, 'Could not start checkout. Please try again.')
  }
})

function memberSubscriptionId(userId: number): string {
  const row = db.prepare('SELECT stripe_subscription_id, status FROM subscriptions WHERE user_id = ?').get(userId) as
    | { stripe_subscription_id: string | null; status: string | null }
    | undefined
  if (!row?.stripe_subscription_id || !LIVE_SUBSCRIPTION_STATUSES.includes(row.status ?? '')) throw new HttpError(400, "You don't have an active subscription")
  return row.stripe_subscription_id
}

/** Stops renewal: the member keeps access until the end of the period they've paid for (or the trial). */
subscriptionRouter.post('/subscription/cancel', async (req, res) => {
  const sub = await stripe<StripeSubscription>(`/subscriptions/${encodeURIComponent(memberSubscriptionId(req.user!.id))}`, { cancel_at_period_end: 'true' })
  applyStripeSubscription(sub)
  res.json(getSubscription(req.user!.id))
})

/** Undoes a cancellation before the period ends. */
subscriptionRouter.post('/subscription/resume', async (req, res) => {
  const sub = await stripe<StripeSubscription>(`/subscriptions/${encodeURIComponent(memberSubscriptionId(req.user!.id))}`, { cancel_at_period_end: 'false' })
  applyStripeSubscription(sub)
  res.json(getSubscription(req.user!.id))
})
