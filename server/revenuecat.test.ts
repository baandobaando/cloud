import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { before, test } from 'node:test'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bingetube-rc-'))
process.env.REVENUECAT_WEBHOOK_AUTH = 'rc_secret'
const { db } = await import('./db.ts')
const { handleRevenueCatEvent } = await import('./revenuecat.ts')
const { getSubscription, isActive } = await import('./models.ts')

const DAY = 86_400_000
let userId: number
before(() => {
  userId = Number(db.prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES ('ios@test.com', 'x', 'iOS', ?)").run(Date.now()).lastInsertRowid)
})
const ev = (over: Record<string, unknown>) => ({ id: crypto.randomUUID(), app_user_id: String(userId), entitlement_ids: ['members'], environment: 'PRODUCTION', ...over })

test('trial purchase unlocks everything until the trial ends, with no revenue recorded', () => {
  handleRevenueCatEvent(ev({ type: 'INITIAL_PURCHASE', period_type: 'TRIAL', expiration_at_ms: Date.now() + 3 * DAY, price: 0 }))
  const s = getSubscription(userId)!
  assert.equal(s.source, 'apple')
  assert.equal(isActive(s), true)
  assert.equal(s.renews, true)
  assert.ok(s.trialEndsAt)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payments WHERE user_id = ?').get(userId)!.n, 0)
})

test('a renewal extends access and records the charge once; sandbox charges are marked as test', () => {
  const e = ev({ type: 'RENEWAL', period_type: 'NORMAL', expiration_at_ms: Date.now() + 30 * DAY, price: 9.99 })
  handleRevenueCatEvent(e)
  handleRevenueCatEvent(e)
  handleRevenueCatEvent(ev({ type: 'RENEWAL', period_type: 'NORMAL', expiration_at_ms: Date.now() + 31 * DAY, price: 9.99, environment: 'SANDBOX' }))
  const rows = (db.prepare('SELECT provider, amount_cents FROM payments WHERE user_id = ? ORDER BY id').all(userId) as { provider: string; amount_cents: number }[]).map((r) => ({ ...r }))
  assert.deepEqual(rows, [{ provider: 'apple', amount_cents: 999 }, { provider: 'test', amount_cents: 999 }])
  assert.equal(getSubscription(userId)!.trialEndsAt, null)
})

test('cancelling keeps access until expiry; expiration ends it', () => {
  handleRevenueCatEvent(ev({ type: 'CANCELLATION', period_type: 'NORMAL', expiration_at_ms: Date.now() + 10 * DAY }))
  let s = getSubscription(userId)!
  assert.deepEqual([s.cancelAtPeriodEnd, s.renews, isActive(s)], [true, false, true])
  handleRevenueCatEvent(ev({ type: 'EXPIRATION', period_type: 'NORMAL', expiration_at_ms: Date.now() - 1000 }))
  s = getSubscription(userId)!
  assert.equal(isActive(s), false)
})

test('ignores anonymous app users, other entitlements, and never replaces a live website subscription', () => {
  handleRevenueCatEvent(ev({ type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:abc', expiration_at_ms: Date.now() + DAY }))
  handleRevenueCatEvent(ev({ type: 'INITIAL_PURCHASE', entitlement_ids: ['other'], expiration_at_ms: Date.now() + DAY }))
  assert.equal(isActive(getSubscription(userId)), false)

  const web = Number(db.prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES ('web@test.com', 'x', 'W', ?)").run(Date.now()).lastInsertRowid)
  db.prepare("INSERT INTO subscriptions (user_id, plan, current_period_end, source, updated_at, stripe_subscription_id, status) VALUES (?, 'member', ?, 'card', ?, 'sub_x', 'active')").run(web, Date.now() + 20 * DAY, Date.now())
  handleRevenueCatEvent(ev({ type: 'EXPIRATION', app_user_id: String(web), expiration_at_ms: Date.now() - 1 }))
  assert.equal(getSubscription(web)!.source, 'card')
  assert.equal(isActive(getSubscription(web)), true)
})
