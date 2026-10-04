import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bingetube-analytics-'))
const { db } = await import('./db.ts')
const { buildAnalytics } = await import('./analytics.ts')

const DAY = 86_400_000
const now = Date.UTC(2026, 5, 15, 12)

function user(daysAgo: number, paidCents?: number, provider = 'nowpayments') {
  const t = now - daysAgo * DAY
  const id = Number(
    db.prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES (?, 'x', 'U', ?)").run(`u${Math.random()}@x.co`, t).lastInsertRowid,
  )
  if (paidCents) {
    db.prepare("INSERT INTO orders (id, user_id, plan, months, amount_cents, provider, status, pay_currency, created_at) VALUES (?, ?, 'member', 1, ?, ?, 'paid', 'btc', ?)").run(`o${id}`, id, paidCents, provider, t)
    db.prepare("INSERT INTO payments (user_id, amount_cents, plan, provider, order_id, created_at) VALUES (?, ?, 'member', ?, ?, ?)").run(id, paidCents, provider, `o${id}`, t)
  }
}

test('splits totals into this period vs the previous one, ignoring test payments', () => {
  user(2, 999) // this week
  user(3) // this week, free
  user(5, 2697) // this week
  user(9, 999) // previous week
  user(4, 999, 'test') // test payment: counted as a signup, not revenue
  user(30) // outside both periods

  const a = buildAnalytics('7d', now)
  assert.equal(a.buckets.length, 7)
  assert.equal(a.kpis.signups.value, 4)
  assert.equal(a.kpis.signups.previous, 1)
  assert.equal(a.kpis.revenueCents.value, 999 + 2697)
  assert.equal(a.kpis.revenueCents.previous, 999)
  assert.equal(a.kpis.revenueCents.series.reduce((x, y) => x + y, 0), 999 + 2697)
  assert.equal(a.kpis.newMembers.value, 2)
  assert.equal(Math.round(a.kpis.conversion.value), 50)
  assert.deepEqual(a.funnel.map((f) => f.value), [4, 0, 3, 3])
  assert.equal(a.currencies[0].currency, 'BTC')
})
