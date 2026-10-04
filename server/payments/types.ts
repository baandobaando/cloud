import type { OrderStatus, PaymentProviderInfo } from '../../shared/types.ts'

export interface InvoiceRequest {
  orderId: string
  amountCents: number
  description: string
  /** Where the processor should send the buyer after paying. */
  returnUrl: string
  /** Where to send the buyer if they back out of checkout (defaults to returnUrl). */
  cancelUrl?: string
  /** Prefills the buyer's email on the processor's checkout page. */
  email?: string
}

export interface WebhookResult {
  /** Our order id (if the payload carries it) or the processor's invoice id. */
  orderId?: string
  invoiceId?: string
  status: OrderStatus
  /** USD amount the processor says the invoice was for, when available. */
  amountCents?: number
  payCurrency?: string
}

export interface PaymentProvider {
  info: PaymentProviderInfo
  isConfigured(): boolean
  createInvoice(req: InvoiceRequest): Promise<{ invoiceId: string; checkoutUrl: string }>
  /** Authoritative status lookup, used as a fallback if a webhook was missed. Null if unsupported. */
  fetchStatus(invoiceId: string): Promise<OrderStatus | null>
  /**
   * Verifies the webhook signature and parses the payload.
   * Throws on a bad signature; returns null for events we don't care about.
   */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<WebhookResult | null>
}

export class WebhookSignatureError extends Error {}
