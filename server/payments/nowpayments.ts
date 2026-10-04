import crypto from 'node:crypto'
import type { OrderStatus } from '../../shared/types.ts'
import { config } from '../config.ts'
import { WebhookSignatureError, type PaymentProvider } from './types.ts'

// Docs: https://documenter.getpostman.com/view/7907941/2s93JusNJt

const apiBase = () => (config.nowpayments.sandbox ? 'https://api-sandbox.nowpayments.io/v1' : 'https://api.nowpayments.io/v1')

const STATUS_MAP: Record<string, OrderStatus> = {
  waiting: 'pending',
  // Underpaid invoices stay pending; an admin can review them in the NOWPayments dashboard.
  partially_paid: 'pending',
  confirming: 'confirming',
  // "confirmed" = enough blockchain confirmations; "sending"/"finished" = being/been paid out to us.
  confirmed: 'paid',
  sending: 'paid',
  finished: 'paid',
  failed: 'failed',
  refunded: 'failed',
  expired: 'expired',
}

/** NOWPayments signs the JSON payload with keys sorted alphabetically (recursively). */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    )
  }
  return value
}

export const nowpayments: PaymentProvider = {
  info: {
    id: 'nowpayments',
    name: 'NOWPayments',
    description: 'Pay with BTC, ETH, USDT, SOL, LTC and 300+ other coins',
  },

  isConfigured: () => Boolean(config.nowpayments.apiKey && config.nowpayments.ipnSecret),

  async createInvoice({ orderId, amountCents, description, returnUrl }) {
    const res = await fetch(`${apiBase()}/invoice`, {
      method: 'POST',
      headers: { 'x-api-key': config.nowpayments.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: amountCents / 100,
        price_currency: 'usd',
        order_id: orderId,
        order_description: description,
        ipn_callback_url: `${config.appUrl}/api/billing/webhooks/nowpayments`,
        success_url: returnUrl,
        cancel_url: returnUrl,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { id?: string | number; invoice_url?: string; message?: string }
    if (!res.ok || !data.id || !data.invoice_url) {
      throw new Error(`NOWPayments invoice failed (${res.status}): ${data.message ?? 'unknown error'}`)
    }
    return { invoiceId: String(data.id), checkoutUrl: data.invoice_url }
  },

  // Invoice lookups need a separate JWT login; we rely on IPN callbacks (which NOWPayments retries).
  fetchStatus: async () => null,

  async parseWebhook(rawBody, headers) {
    const signature = headers['x-nowpayments-sig']
    if (typeof signature !== 'string') throw new WebhookSignatureError('Missing x-nowpayments-sig')
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch {
      throw new WebhookSignatureError('Invalid JSON')
    }
    const expected = crypto
      .createHmac('sha512', config.nowpayments.ipnSecret)
      .update(JSON.stringify(sortKeys(payload)))
      .digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature.toLowerCase())
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new WebhookSignatureError('Bad signature')

    const status = STATUS_MAP[String(payload.payment_status)]
    if (!status) return null
    const priceCurrency = String(payload.price_currency ?? '').toLowerCase()
    return {
      orderId: payload.order_id ? String(payload.order_id) : undefined,
      invoiceId: payload.invoice_id ? String(payload.invoice_id) : undefined,
      status,
      amountCents: priceCurrency === 'usd' ? Math.round(Number(payload.price_amount) * 100) : undefined,
      payCurrency: payload.pay_currency ? String(payload.pay_currency).toUpperCase() : undefined,
    }
  },
}
