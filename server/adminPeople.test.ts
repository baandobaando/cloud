import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bingetube-admin-'))
const { default: express } = await import('express')
const { db } = await import('./db.ts')
const { adminRouter } = await import('./admin.ts')
import type { AdminOrderPage, AdminUserDetail, AdminUserPage, AdminUserRow } from '../shared/types.ts'

const DAY = 86_400_000
let base = ''
let server: ReturnType<ReturnType<typeof express>['listen']>
let adminId = 0

const addUser = (email: string, created = Date.now(), isAdmin = 0) =>
  Number(db.prepare("INSERT INTO users (email, password_hash, name, is_admin, created_at) VALUES (?, 'scrypt$x$y', ?, ?, ?)").run(email, email.split('@')[0], isAdmin, created).lastInsertRowid)
const sub = (userId: number, end: number | null, source = 'crypto') =>
  db.prepare("INSERT OR REPLACE INTO subscriptions (user_id, plan, current_period_end, source, updated_at) VALUES (?, 'member', ?, ?, 0)").run(userId, end, source)

async function call<T>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T; text: string }> {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let data: T
  try {
    data = JSON.parse(text) as T
  } catch {
    data = undefined as T
  }
  return { status: res.status, data, text }
}

before(async () => {
  adminId = addUser('boss@x.co', Date.now(), 1)
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { id: adminId, email: 'boss@x.co', name: 'Boss', isAdmin: true }
    next()
  })
  app.use('/api/admin', adminRouter)
  app.use((err: { status?: number; message: string }, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
    res.status(err.status ?? 500).json({ error: err.message })
  })
  await new Promise<void>((r) => {
    server = app.listen(0, () => r())
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`
})
after(() => server.close())

test('users: filters run in SQL, paginate, and escape LIKE wildcards', async () => {
  for (let i = 0; i < 60; i++) addUser(`free${i}@x.co`, Date.now() - (i + 1) * 1000)
  const paid = addUser('paid@x.co', Date.now() - 100 * DAY)
  sub(paid, Date.now() + 10 * DAY)
  const old = addUser('lapsed@x.co', Date.now() - 200 * DAY)
  sub(old, Date.now() - DAY)
  addUser('50%off@x.co')

  const all = await call<AdminUserPage>('GET', '/users')
  assert.equal(all.data.users.length, 50)
  assert.equal(all.data.total, 64)
  const p2 = await call<AdminUserPage>('GET', '/users?page=2')
  assert.equal(p2.data.users.length, 14)

  const members = await call<AdminUserPage>('GET', '/users?filter=members')
  assert.deepEqual(members.data.users.map((u) => u.email), ['paid@x.co'], 'old member beyond the first 200 newest still found')
  assert.equal((await call<AdminUserPage>('GET', '/users?filter=expired')).data.users[0].email, 'lapsed@x.co')
  assert.equal((await call<AdminUserPage>('GET', '/users?q=50%25')).data.total, 1)
  assert.equal(all.data.stats.paying, 1)
})

test('grant stacks on paid time instead of shortening it, and keeps the paid source', async () => {
  const id = addUser('stack@x.co')
  const end = Date.now() + 300 * DAY
  sub(id, end, 'crypto')
  const r = await call<AdminUserRow>('POST', `/users/${id}/access`, { days: 7 })
  assert.equal(r.status, 200)
  assert.ok(Math.abs(r.data.subscription!.currentPeriodEnd! - (end + 7 * DAY)) < 1000)
  assert.equal(r.data.subscription!.source, 'crypto')

  const fresh = addUser('gift@x.co')
  const g = await call<AdminUserRow>('POST', `/users/${fresh}/access`, { days: 30 })
  assert.equal(g.data.subscription!.source, 'comp')
  const detail = await call<AdminUserDetail>('GET', `/users/${fresh}`)
  assert.equal(detail.data.activity[0].action, 'Granted access')
})

test('sign out everywhere, then delete a user; admins are protected', async () => {
  const id = addUser('gone@x.co')
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run('t1', id, Date.now(), Date.now() + DAY)
  const out = await call<{ sessions: number }>('POST', `/users/${id}/sign-out`)
  assert.equal(out.data.sessions, 1)
  assert.equal((await call('DELETE', `/users/${id}`)).status, 200)
  assert.equal((await call('GET', `/users/${id}`)).status, 404)
  assert.equal((await call('DELETE', `/users/${adminId}`)).status, 400)
  const log = await call<{ action: string }[]>('GET', '/activity')
  assert.ok(log.data.some((a) => a.action === 'Deleted user'))
})

test('orders: stale pending reads as expired, search and CSV work, mark paid logs', async () => {
  const u = addUser('buyer@x.co')
  const ins = db.prepare("INSERT INTO orders (id, user_id, plan, months, amount_cents, provider, status, created_at) VALUES (?, ?, 'member', 1, 999, 'nowpayments', ?, ?)")
  ins.run('old-pending', u, 'pending', Date.now() - 3 * DAY)
  ins.run('new-pending', u, 'pending', Date.now())
  ins.run('done', u, 'paid', Date.now())

  const expired = await call<AdminOrderPage>('GET', '/orders?status=expired')
  assert.deepEqual(expired.data.orders.map((o) => o.id), ['old-pending'])
  assert.equal(expired.data.stats.paid, 1)
  assert.equal((await call<AdminOrderPage>('GET', '/orders?q=buyer')).data.total, 3)

  const csv = await call('GET', '/orders.csv')
  assert.match(csv.text, /^order_id,email/)
  assert.equal(csv.text.trim().split('\n').length, 4)

  assert.equal((await call('POST', '/orders/new-pending/mark-paid', { note: 'paid by bank' })).status, 200)
  const log = await call<{ action: string; detail: string }[]>('GET', '/activity')
  assert.ok(log.data.some((a) => a.action === 'Marked order paid' && a.detail.includes('paid by bank')))
})
