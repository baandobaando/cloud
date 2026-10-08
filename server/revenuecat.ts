import crypto from 'node:crypto'
import { Router } from 'express'
import { MEMBERSHIP } from '../shared/types.ts'
import { requireUser } from './auth.ts'
import { config } from './config.ts'
import { db, transaction } from './db.ts'
import { HttpError, rateLimit } from './http.ts'
import { getSubscription } from './models.ts'

/**
 * iPhone app subscriptions: Apple in-app purchases, handled by RevenueCat. The app identifies purchases with our user
 * id (RevenueCat "app user id"), and RevenueCat tells us about every change by webhook. Membership is the same
 * `subscriptions` row the website uses, with source 'apple', so an iPhone subscription unlocks the website too.
 */

export const revenuecatConfigured = () => Boolean(config.revenuecat.webhookAuth || config.revenuecat.secretKey)

export interface AppleState {
  /** When access ends (ms). */
  expiresAt: number
  trial: boolean
  /** Auto-renew turned off: access continues to expiresAt, then stops. */
  cancelled: boolean
  expired: boolean
}

/** Mirrors an Apple subscription onto the member's row. Never overwrites a live Stripe subscription. */
export function applyAppleSubscription(userId: number, s: AppleState) {
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) return
  const current = db.prepare('SELECT source, stripe_subscription_id, status FROM subscriptions WHERE user_id = ?').get(userId) as
    | { source: string; stripe_subscription_id: string | null; status: string | null }
    | undefined
  // Someone already paying through the website keeps that membership; an App Store event must not replace it.
  if (current?.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(current.status ?? '')) return
  const now = Date.now()
  const status = s.expired || s.expiresAt <= now ? 'canceled' : s.trial ? 'trialing' : 'active'
  transaction(() => {
    db.prepare(
      `INSERT INTO subscriptions (user_id, plan, current_period_end, source, updated_at, stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end, trial_end)
       VALUES (?, ?, ?, 'apple', ?, NULL, NULL, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, current_period_end = excluded.current_period_end, source = 'apple',
         updated_at = excluded.updated_at, stripe_customer_id = NULL, stripe_subscription_id = NULL, status = excluded.status,
         cancel_at_period_end = excluded.cancel_at_period_end, trial_end = excluded.trial_end`,
    ).run(userId, MEMBERSHIP.id, s.expired ? Math.min(s.expiresAt, now) : s.expiresAt, now, status, s.cancelled ? 1 : 0, s.trial ? s.expiresAt : null)
    if (s.trial) db.prepare('UPDATE users SET trial_used_at = COALESCE(trial_used_at, ?) WHERE id = ?').run(now, userId)
  })
}

/** Our user id from a RevenueCat app user id (anonymous "$RCAnonymousID:…" ids aren't ours). */
const userIdOf = (appUserId: unknown) => (typeof appUserId === 'string' && /^\d+$/.test(appUserId) ? Number(appUserId) : null)

interface RcEvent {
  id?: string
  type?: string
  app_user_id?: string
  original_app_user_id?: string
  aliases?: string[]
  transferred_to?: string[]
  expiration_at_ms?: number | null
  period_type?: string
  price?: number | null
  environment?: string
  entitlement_ids?: string[] | null
}

export const revenuecatRouter = Router()

/** RevenueCat webhook (raw body, authenticated by the Authorization value configured in RevenueCat). */
revenuecatRouter.post('/webhooks/revenuecat', (req, res) => {
  const expected = config.revenuecat.webhookAuth
  if (!expected) throw new HttpError(404, 'Not configured')
  const got = String(req.headers.authorization ?? '')
  const a = Buffer.from(got.replace(/^Bearer\s+/i, ''))
  const b = Buffer.from(expected.replace(/^Bearer\s+/i, ''))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Unauthorized')

  const body = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {})) as { event?: RcEvent }
  const e = body.event ?? {}
  handleRevenueCatEvent(e)
  res.json({ ok: true })
})

export function handleRevenueCatEvent(e: RcEvent) {
  if (e.entitlement_ids && !e.entitlement_ids.includes(config.revenuecat.entitlement)) return
  const ids = e.type === 'TRANSFER' ? (e.transferred_to ?? []) : [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])]
  const userId = ids.map(userIdOf).find((id) => id !== null)
  if (!userId || !e.type || e.type === 'TEST') return
  const expiresAt = e.expiration_at_ms ?? Date.now()
  const trial = e.period_type === 'TRIAL'

  switch (e.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'TRANSFER':
    case 'SUBSCRIPTION_EXTENDED':
    case 'TEMPORARY_ENTITLEMENT_GRANT':
      applyAppleSubscription(userId, { expiresAt, trial, cancelled: false, expired: false })
      break
    case 'CANCELLATION':
      applyAppleSubscription(userId, { expiresAt, trial, cancelled: true, expired: false })
      break
    case 'BILLING_ISSUE':
      // Apple retries the charge; access continues until the expiration it reports.
      applyAppleSubscription(userId, { expiresAt, trial, cancelled: false, expired: false })
      break
    case 'EXPIRATION':
      applyAppleSubscription(userId, { expiresAt, trial, cancelled: true, expired: true })
      break
    default:
      return
  }

  // Real charges (not the free trial) count as revenue; sandbox ones (App Review, TestFlight) don't.
  if ((e.type === 'INITIAL_PURCHASE' || e.type === 'RENEWAL') && !trial && e.price && e.price > 0 && e.id) {
    db.prepare(
      `INSERT INTO payments (user_id, amount_cents, currency, plan, provider, provider_ref, created_at) VALUES (?, ?, 'usd', ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    ).run(userId, Math.round(e.price * 100), MEMBERSHIP.id, e.environment === 'SANDBOX' ? 'test' : 'apple', `rc:${e.id}`, Date.now())
  }
}

/**
 * Asks RevenueCat for the signed-in member's subscription and applies it straight away, so the app unlocks right
 * after a purchase or restore without waiting for the webhook.
 */
revenuecatRouter.post('/apple/sync', requireUser, rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const { projectId, secretKey } = config.revenuecat
  if (!projectId || !secretKey) throw new HttpError(404, 'Not configured')
  const userId = req.user!.id
  const r = await fetch(
    `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(String(userId))}/subscriptions`,
    { headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' } },
  )
  // A customer RevenueCat has never seen simply has no App Store subscription yet.
  if (r.status === 404) return res.json(getSubscription(userId))
  if (!r.ok) throw new HttpError(502, 'Could not check your App Store subscription. Please try again.')
  const data = (await r.json()) as {
    items?: {
      status?: string
      gives_access?: boolean
      auto_renewal_status?: string
      current_period_ends_at?: number | null
      ends_at?: number | null
    }[]
  }
  // The App Store subscription that runs latest decides; it unlocks only while RevenueCat says it gives access.
  const sub = (data.items ?? [])
    .filter((s) => s.current_period_ends_at || s.ends_at)
    .sort((a, b) => (b.current_period_ends_at ?? b.ends_at ?? 0) - (a.current_period_ends_at ?? a.ends_at ?? 0))[0]
  if (sub) {
    const expiresAt = Number(sub.current_period_ends_at ?? sub.ends_at)
    applyAppleSubscription(userId, {
      expiresAt,
      trial: sub.status === 'trialing',
      cancelled: sub.auto_renewal_status !== 'will_renew',
      expired: !sub.gives_access || expiresAt <= Date.now(),
    })
  }
  res.json(getSubscription(userId))
})
