import crypto from 'node:crypto'
import type { OrderStatus } from '../../shared/types.ts'
import { config } from '../config.ts'
import { WebhookSignatureError, type PaymentProvider } from './types.ts'

// Stripe Checkout in one-time "payment" mode: each order is a prepaid pass, nothing auto-renews.
// Docs: https://docs.stripe.com/api/checkout/sessions and https://docs.stripe.com/webhooks#verify-manually

const API = 'https://api.stripe.com/v1'
/** Reject webhooks signed more than this long ago (replay protection, Stripe's default). */
const TOLERANCE_S = 300

interface Session {
  id: string
  url?: string | null
  status?: 'open' | 'complete' | 'expired'
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required'
  client_reference_id?: string | null
  metadata?: Record<string, string>
  amount_total?: number | null
  currency?: string | null
}

async function stripe<T>(path: string, form?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: form ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${config.stripe.secretKey}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(`Stripe ${path} failed (${res.status}): ${data.error?.message ?? 'unknown error'}`)
  return data
}

function sessionStatus(s: Session): OrderStatus {
  if (s.status === 'expired') return 'expired'
  if (s.status === 'complete') return s.payment_status === 'unpaid' ? 'confirming' : 'paid'
  return 'pending'
}

/** Verifies a `Stripe-Signature: t=…,v1=…` header against the raw request body. */
export function verifyStripeSignature(rawBody: Buffer, header: string, secret: string, nowS = Math.floor(Date.now() / 1000)) {
  let t = ''
  const sigs: string[] = []
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2)
    if (k === 't') t = v ?? ''
    else if (k === 'v1' && v) sigs.push(v)
  }
  if (!/^\d+$/.test(t) || sigs.length === 0) throw new WebhookSignatureError('Malformed Stripe-Signature')
  if (Math.abs(nowS - Number(t)) > TOLERANCE_S) throw new WebhookSignatureError('Signature timestamp too old')
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex'))
  const ok = sigs.some((s) => {
    const b = Buffer.from(s.toLowerCase())
    return b.length === expected.length && crypto.timingSafeEqual(b, expected)
  })
  if (!ok) throw new WebhookSignatureError('Bad signature')
}

export const stripeProvider: PaymentProvider = {
  info: {
    id: 'stripe',
    name: 'Card, Apple Pay or Google Pay',
    description: 'Secure checkout by Stripe',
  },

  isConfigured: () => Boolean(config.stripe.secretKey && config.stripe.webhookSecret),

  async createInvoice({ orderId, amountCents, description, returnUrl, cancelUrl, email }) {
    const form: Record<string, string> = {
      mode: 'payment',
      success_url: returnUrl,
      cancel_url: cancelUrl ?? returnUrl,
      client_reference_id: orderId,
      'metadata[order_id]': orderId,
      'payment_intent_data[metadata][order_id]': orderId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][price_data][product_data][name]': description,
    }
    if (email) form.customer_email = email
    const s = await stripe<Session>('/checkout/sessions', form)
    if (!s.id || !s.url) throw new Error('Stripe returned a session without a checkout URL')
    return { invoiceId: s.id, checkoutUrl: s.url }
  },

  async fetchStatus(invoiceId) {
    return sessionStatus(await stripe<Session>(`/checkout/sessions/${encodeURIComponent(invoiceId)}`))
  },

  async parseWebhook(rawBody, headers) {
    const header = headers['stripe-signature']
    if (typeof header !== 'string') throw new WebhookSignatureError('Missing Stripe-Signature')
    verifyStripeSignature(rawBody, header, config.stripe.webhookSecret)

    const event = JSON.parse(rawBody.toString('utf8')) as { type?: string; data?: { object?: Session } }
    const s = event.data?.object
    if (!s?.id || !event.type?.startsWith('checkout.session.')) return null
    let status: OrderStatus
    switch (event.type) {
      case 'checkout.session.completed':
        status = sessionStatus({ ...s, status: 'complete' })
        break
      case 'checkout.session.async_payment_succeeded':
        status = 'paid'
        break
      case 'checkout.session.async_payment_failed':
        status = 'failed'
        break
      case 'checkout.session.expired':
        status = 'expired'
        break
      default:
        return null
    }
    return {
      orderId: s.client_reference_id ?? s.metadata?.order_id ?? undefined,
      invoiceId: s.id,
      status,
      amountCents: s.currency?.toLowerCase() === 'usd' && typeof s.amount_total === 'number' ? s.amount_total : undefined,
      payCurrency: 'CARD',
    }
  },
}
