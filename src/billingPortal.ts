import { api } from './api'

/** Sends the member to Stripe's billing page to change their card, pay a failed invoice or see receipts. */
export async function openBillingPortal() {
  const { url } = await api.post<{ url: string }>('/billing/subscription/portal')
  window.location.href = url
}
