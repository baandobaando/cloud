import crypto from 'node:crypto'
import { Router } from 'express'
import { MEMBERSHIP, TRIAL_DAYS } from '../shared/types.ts'
import { requireUser } from './auth.ts'
import { config } from './config.ts'
import { db, transaction } from './db.ts'
import { HttpError, rateLimit } from './http.ts'
import { LIVE_SUBSCRIPTION_STATUSES, getSubscription } from './models.ts'
import { StripeError, stripe, stripeProvider } from './payments/stripe.ts'

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
  default_payment_method?: string | null
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
  // A trial we cancelled because its card failed the check: it never counted, so it must not use up the trial.
  if (s.metadata?.card_check === 'declined') return null
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

/** Bank decline codes that mean "this card can't be used for this kind of payment", in words a customer understands. */
const DECLINE_REASONS: Record<string, string> = {
  transaction_not_allowed: 'Your bank blocked this card for online subscription payments.',
  card_not_supported: 'Your bank blocked this card for online subscription payments.',
  do_not_honor: 'Your bank declined the card.',
  generic_decline: 'Your bank declined the card.',
  insufficient_funds: 'The card has insufficient funds.',
  lost_card: 'Your bank declined the card.',
  stolen_card: 'Your bank declined the card.',
  expired_card: 'The card has expired.',
  currency_not_supported: 'This card can’t pay in US dollars.',
}

/**
 * Proves a free-trial card can really be charged, so the first payment doesn't fail three days later: places a $1
 * hold the way a renewal would be charged (off-session) and releases it at once. Saving a card for a trial only runs
 * a $0 check, which cards blocked for online or recurring payments (common with some banks) still pass.
 * Returns the reason when the bank refuses; null when the card is fine or the check couldn't run (we never block a
 * customer over our own or Stripe's hiccup).
 */
async function checkTrialCard(sub: StripeSubscription): Promise<string | null> {
  const pm = sub.default_payment_method
  if (!pm) return null
  try {
    const pi = await stripe<{ id: string; status: string }>('/payment_intents', {
      amount: '100',
      currency: 'usd',
      customer: sub.customer,
      payment_method: pm,
      confirm: 'true',
      off_session: 'true',
      capture_method: 'manual',
      description: 'BingeTube card check (temporary hold, released immediately)',
      'metadata[purpose]': 'trial_card_check',
      'metadata[subscription]': sub.id,
    })
    if (pi.status === 'requires_capture' || pi.status === 'requires_action' || pi.status === 'requires_payment_method') {
      await stripe(`/payment_intents/${pi.id}/cancel`, {}).catch(() => {})
    }
    return null
  } catch (err) {
    if (!(err instanceof StripeError) || err.type !== 'card_error') {
      console.warn('[billing] trial card check could not run:', (err as Error).message)
      return null
    }
    // The bank wants the customer to approve off-session charges: Stripe asks them by email when renewals need it.
    if (err.code === 'authentication_required' || err.declineCode === 'authentication_required') return null
    return DECLINE_REASONS[err.declineCode ?? ''] ?? 'Your bank declined the card.'
  }
}

/**
 * Finishes the checkout that started a subscription: marks its order paid and links the subscription to the member.
 * A free trial first passes the card check; a card that fails it ends the trial straight away (no access, nothing
 * charged, trial not used up) so the customer can try another card or Apple Pay.
 * Safe to call more than once (webhook and the order page's status check can both get here).
 */
export async function completeSubscriptionOrder(orderId: string, sessionId: string) {
  const session = await stripe<{ subscription?: string | null; customer?: string | null; status?: string }>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
  )
  if (session.status !== 'complete' || !session.subscription) return
  const sub = await fetchSubscription(session.subscription)
  const userId = Number(sub.metadata?.user_id) || orderUser(orderId)

  if (sub.status === 'trialing' && sub.metadata?.card_check !== 'ok') {
    // Only one caller runs the check; the other sees it running and lets the order page poll again.
    const claimed = db.prepare("UPDATE orders SET card_check = 'running' WHERE id = ? AND card_check IS NULL").run(orderId).changes === 1
    if (!claimed) {
      const state = (db.prepare('SELECT card_check FROM orders WHERE id = ?').get(orderId) as { card_check: string | null } | undefined)?.card_check
      if (state !== 'ok') return
    } else {
      const declined = await checkTrialCard(sub)
      if (declined) {
        await stripe(`/subscriptions/${encodeURIComponent(sub.id)}`, { 'metadata[card_check]': 'declined' }).catch(() => {})
        await stripe(`/subscriptions/${encodeURIComponent(sub.id)}`, undefined, 'DELETE').catch((e) => console.error('[billing] could not cancel declined trial', e))
        transaction(() => {
          db.prepare("UPDATE orders SET card_check = 'declined', status = 'failed', failure_reason = ? WHERE id = ?").run(declined, orderId)
          // Undo the access and trial use the subscription webhook may already have recorded.
          if (userId) {
            db.prepare(
              "UPDATE subscriptions SET stripe_subscription_id = NULL, status = 'canceled', current_period_end = ?, trial_end = NULL WHERE user_id = ? AND (stripe_subscription_id = ? OR stripe_subscription_id IS NULL)",
            ).run(Date.now(), userId, sub.id)
            db.prepare('UPDATE users SET trial_used_at = NULL WHERE id = ?').run(userId)
          }
        })
        console.warn(`[billing] Trial card check declined for order ${orderId}: ${declined}`)
        return
      }
      db.prepare("UPDATE orders SET card_check = 'ok' WHERE id = ?").run(orderId)
      await stripe(`/subscriptions/${encodeURIComponent(sub.id)}`, { 'metadata[card_check]': 'ok' }).catch(() => {})
    }
  }

  applyStripeSubscription({ ...sub, metadata: { ...sub.metadata, user_id: sub.metadata?.user_id ?? String(userId) } })
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

/**
 * Opens Stripe's billing page for the member, where they can change their card, pay a failed invoice and see
 * receipts. Used by the "update your card" prompt after a failed monthly charge.
 */
subscriptionRouter.post('/subscription/portal', rateLimit({ windowMs: 10 * 60 * 1000, max: 20 }), async (req, res) => {
  const row = db.prepare('SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?').get(req.user!.id) as { stripe_customer_id: string | null } | undefined
  if (!row?.stripe_customer_id) throw new HttpError(400, "You don't have a card subscription")
  try {
    const session = await stripe<{ url: string }>('/billing_portal/sessions', { customer: row.stripe_customer_id, return_url: `${config.appUrl}/account` })
    res.json({ url: session.url })
  } catch (err) {
    console.error('[billing] portal session failed', err)
    throw new HttpError(502, 'Could not open the billing page. Please try again.')
  }
})
