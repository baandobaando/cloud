import { config } from '../config.ts'
import type { PaymentProvider } from './types.ts'

/** Local-only fake processor so the full purchase flow can be tried without a real payment. */
export const testProvider: PaymentProvider = {
  info: {
    id: 'test',
    name: 'Test checkout',
    description: 'Development only — simulates a payment, nothing is charged',
  },
  isConfigured: () => config.allowTestBilling,
  async createInvoice({ orderId }) {
    return { invoiceId: orderId, checkoutUrl: `/billing/test-checkout/${orderId}` }
  },
  fetchStatus: async () => null,
  parseWebhook: async () => null,
}
