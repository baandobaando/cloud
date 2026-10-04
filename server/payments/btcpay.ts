import crypto from 'node:crypto'
import type { OrderStatus } from '../../shared/types.ts'
import { config } from '../config.ts'
import { WebhookSignatureError, type PaymentProvider } from './types.ts'

// Greenfield API docs: https://docs.btcpayserver.org/API/Greenfield/v1/

const STATUS_MAP: Record<string, OrderStatus> = {
  New: 'pending',
  Processing: 'confirming',
  Settled: 'paid',
  Expired: 'expired',
  Invalid: 'failed',
}

function storeUrl(path = '') {
  const { url, storeId } = config.btcpay
  return `${url}/api/v1/stores/${encodeURIComponent(storeId)}/invoices${path}`
}

const authHeaders = () => ({ Authorization: `token ${config.btcpay.apiKey}`, 'Content-Type': 'application/json' })

export const btcpay: PaymentProvider = {
  info: {
    id: 'btcpay',
    name: 'BTCPay Server',
    description: 'Bitcoin & Lightning — no middleman, no processor fees',
  },

  isConfigured: () =>
    Boolean(config.btcpay.url && config.btcpay.apiKey && config.btcpay.storeId && config.btcpay.webhookSecret),

  async createInvoice({ orderId, amountCents, description, returnUrl }) {
    const res = await fetch(storeUrl(), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        amount: (amountCents / 100).toFixed(2),
        currency: 'USD',
        metadata: { orderId, itemDesc: description },
        checkout: { redirectURL: returnUrl, redirectAutomatically: true },
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { id?: string; checkoutLink?: string; message?: string }
    if (!res.ok || !data.id || !data.checkoutLink) {
      throw new Error(`BTCPay invoice failed (${res.status}): ${data.message ?? 'unknown error'}`)
    }
    return { invoiceId: data.id, checkoutUrl: data.checkoutLink }
  },

  async fetchStatus(invoiceId) {
    const res = await fetch(storeUrl(`/${encodeURIComponent(invoiceId)}`), { headers: authHeaders() })
    if (!res.ok) return null
    const data = (await res.json()) as { status?: string }
    return STATUS_MAP[data.status ?? ''] ?? null
  },

  async parseWebhook(rawBody, headers) {
    const signature = headers['btcpay-sig']
    if (typeof signature !== 'string' || !signature.startsWith('sha256=')) {
      throw new WebhookSignatureError('Missing BTCPay-Sig')
    }
    const expected = 'sha256=' + crypto.createHmac('sha256', config.btcpay.webhookSecret).update(rawBody).digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new WebhookSignatureError('Bad signature')

    const payload = JSON.parse(rawBody.toString('utf8')) as { type?: string; invoiceId?: string }
    if (!payload.invoiceId || !payload.type?.startsWith('Invoice')) return null
    // Don't trust the event type alone — ask BTCPay for the invoice's current status.
    const status = await btcpay.fetchStatus(payload.invoiceId)
    return status ? { invoiceId: payload.invoiceId, status } : null
  },
}
