import type { Request, Router } from 'express'
import type {
  AdminActivity,
  AdminOrder,
  AdminOrderPage,
  AdminUserDetail,
  AdminUserFilter,
  AdminUserPage,
  AdminUserRow,
  AdminUserSort,
} from '../shared/types.ts'
import { MEMBERSHIP, getPlan } from '../shared/types.ts'
import { ORDER_TTL_MS, fulfillOrder } from './billing.ts'
import { db, transaction } from './db.ts'
import { HttpError, int, str } from './http.ts'
import { getSubscription } from './models.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 50

/** Escapes LIKE wildcards so a search for "50%" means the literal text. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
const page = (v: unknown) => Math.max(1, Math.floor(Number(v) || 1))

type Params = Record<string, string | number>
/** node:sqlite rejects named parameters a statement doesn't use, so pass each query only its own. */
const only = (sql: string, params: Params): Params =>
  Object.fromEntries(Object.entries(params).filter(([k]) => new RegExp(`:${k}\\b`).test(sql)))
const get = <T>(sql: string, params: Params) => db.prepare(sql).get(only(sql, params)) as T
const all = <T>(sql: string, params: Params) => db.prepare(sql).all(only(sql, params)) as unknown as T[]

/** Records an admin action for the activity log. */
export function logAdmin(req: Request, action: string, target: string, detail = '') {
  db.prepare('INSERT INTO admin_actions (admin_id, admin_email, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.user?.id ?? null,
    req.user?.email ?? 'system',
    action,
    target,
    detail,
    Date.now(),
  )
}

// ----- Users -----

/** SQL fragment: a user's membership state, as "active paid", "active comp", "expired" or none. */
const SUB_STATE = `CASE
  WHEN s.user_id IS NULL THEN 'free'
  WHEN s.current_period_end IS NOT NULL AND s.current_period_end <= :now THEN 'expired'
  WHEN s.source = 'comp' THEN 'comp'
  ELSE 'paid' END`

const USER_COLUMNS = `
  u.id, u.email, u.name, u.is_admin, u.created_at, u.password_hash,
  (SELECT MAX(p.updated_at) FROM progress p JOIN profiles pr ON pr.id = p.profile_id WHERE pr.user_id = u.id) AS last_watched,
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'paid') AS paid_orders,
  (SELECT COALESCE(SUM(amount_cents), 0) FROM payments pm WHERE pm.user_id = u.id AND COALESCE(pm.provider, '') != 'test') AS spent,
  (SELECT COUNT(*) FROM episode_views v JOIN profiles pr ON pr.id = v.profile_id WHERE pr.user_id = u.id AND v.created_at > :since) AS views30d,
  (SELECT GROUP_CONCAT(provider) FROM user_identities i WHERE i.user_id = u.id) AS providers`

interface UserRowDb {
  id: number
  email: string
  name: string
  is_admin: number
  created_at: number
  password_hash: string
  last_watched: number | null
  paid_orders: number
  spent: number
  views30d: number
  providers: string | null
}

function toRow(r: UserRowDb): AdminUserRow {
  const methods: AdminUserRow['signInMethods'] = []
  if (r.password_hash.startsWith('scrypt$')) methods.push('password')
  for (const p of (r.providers ?? '').split(',')) if (p === 'google' || p === 'apple') methods.push(p)
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    isAdmin: r.is_admin === 1,
    createdAt: r.created_at,
    subscription: getSubscription(r.id),
    lastWatchedAt: r.last_watched,
    paidOrders: r.paid_orders,
    totalSpentCents: r.spent,
    views30d: r.views30d,
    signInMethods: methods,
  }
}

function userRow(id: number): AdminUserRow {
  const r = get<UserRowDb | undefined>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = :id`, { id, since: Date.now() - 30 * DAY_MS })
  if (!r) throw new HttpError(404, 'User not found')
  return toRow(r)
}

const FILTERS: Record<AdminUserFilter, string> = {
  all: '1 = 1',
  members: `${SUB_STATE} IN ('paid', 'comp')`,
  comp: `${SUB_STATE} = 'comp'`,
  expired: `${SUB_STATE} = 'expired'`,
  free: `${SUB_STATE} = 'free'`,
  admins: 'u.is_admin = 1',
}
const SORTS: Record<AdminUserSort, string> = {
  newest: 'u.created_at DESC',
  oldest: 'u.created_at ASC',
  name: 'u.name COLLATE NOCASE ASC',
  spent: 'spent DESC, u.created_at DESC',
  active: 'last_watched IS NULL, last_watched DESC',
}

function queryUsers(q: string, filter: AdminUserFilter, sort: AdminUserSort, limit: number, offset: number) {
  const where = `(:q = '' OR u.email LIKE :like ESCAPE '\\' OR u.name LIKE :like ESCAPE '\\') AND ${FILTERS[filter]}`
  const params = { q, like: like(q), now: Date.now(), since: Date.now() - 30 * DAY_MS }
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE ${where}`, params).n
  const rows = all<UserRowDb>(
    `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id
     WHERE ${where} ORDER BY ${SORTS[sort]} LIMIT :limit OFFSET :offset`,
    { ...params, limit, offset },
  )
  return { total, users: rows.map(toRow) }
}

function userQuery(req: Request) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
  const filter = (Object.keys(FILTERS).includes(String(req.query.filter)) ? req.query.filter : 'all') as AdminUserFilter
  const sort = (Object.keys(SORTS).includes(String(req.query.sort)) ? req.query.sort : 'newest') as AdminUserSort
  return { q, filter, sort }
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  // Leading = + - @ would run as formulas in spreadsheet apps.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : '')

// ----- Orders -----

interface OrderRowDb {
  id: string
  user_id: number | null
  email: string | null
  plan: string
  months: number
  amount_cents: number
  provider: string
  provider_invoice_id: string | null
  checkout_url: string | null
  status: string
  pay_currency: string | null
  created_at: number
  paid_at: number | null
}

/** Pending orders older than a day have lapsed at the processor; show them the way customers see them. */
const EFFECTIVE_STATUS = `CASE WHEN o.status = 'pending' AND o.created_at < :stale THEN 'expired' ELSE o.status END`

function toOrder(o: OrderRowDb, now = Date.now()): AdminOrder {
  const stale = o.status === 'pending' && now - o.created_at > ORDER_TTL_MS
  return {
    id: o.id,
    userId: o.user_id,
    email: o.email ?? '(deleted user)',
    plan: o.plan,
    months: o.months,
    amountCents: o.amount_cents,
    provider: o.provider,
    providerInvoiceId: o.provider_invoice_id,
    checkoutUrl: o.checkout_url,
    status: (stale ? 'expired' : o.status) as AdminOrder['status'],
    payCurrency: o.pay_currency,
    createdAt: o.created_at,
    paidAt: o.paid_at,
  }
}

function queryOrders(req: Request, limit: number, offset: number) {
  const status = typeof req.query.status === 'string' ? req.query.status : ''
  const provider = typeof req.query.provider === 'string' ? req.query.provider : ''
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
  const from = Number(req.query.from) || 0
  const to = Number(req.query.to) || 0
  const params = { status, provider, q, like: like(q), from, to, stale: Date.now() - ORDER_TTL_MS }
  const where = `(:status = '' OR ${EFFECTIVE_STATUS} = :status)
    AND (:provider = '' OR o.provider = :provider)
    AND (:q = '' OR u.email LIKE :like ESCAPE '\\' OR o.id LIKE :like ESCAPE '\\' OR COALESCE(o.provider_invoice_id, '') LIKE :like ESCAPE '\\')
    AND (:from = 0 OR o.created_at >= :from) AND (:to = 0 OR o.created_at < :to)`
  const base = `FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE ${where}`
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n ${base}`, params).n
  const rows = all<OrderRowDb>(`SELECT o.*, u.email ${base} ORDER BY o.created_at DESC LIMIT :limit OFFSET :offset`, { ...params, limit, offset })
  // Stats follow the same filters except status, so the tiles explain the whole filtered set.
  const statParams = { ...params, status: '' }
  const s = get<{ paid: number | null; revenue: number | null; pending: number | null; expired: number | null; failed: number | null; n: number }>(
      `SELECT
         SUM(CASE WHEN ${EFFECTIVE_STATUS} = 'paid' THEN 1 ELSE 0 END) AS paid,
         SUM(CASE WHEN ${EFFECTIVE_STATUS} = 'paid' AND o.provider != 'test' THEN o.amount_cents ELSE 0 END) AS revenue,
         SUM(CASE WHEN ${EFFECTIVE_STATUS} IN ('pending', 'confirming') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN ${EFFECTIVE_STATUS} = 'expired' THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN ${EFFECTIVE_STATUS} = 'failed' THEN 1 ELSE 0 END) AS failed,
         COUNT(*) AS n
       ${base}`,
    statParams,
  )
  return {
    total,
    orders: rows.map((r) => toOrder(r)),
    stats: {
      paid: s.paid ?? 0,
      revenueCents: s.revenue ?? 0,
      pending: s.pending ?? 0,
      expired: s.expired ?? 0,
      failed: s.failed ?? 0,
      conversion: s.n ? ((s.paid ?? 0) / s.n) * 100 : 0,
    },
  }
}

/** Users, orders and the admin activity log. */
export function registerPeopleRoutes(router: Router) {
  router.get('/users', (req, res) => {
    const { q, filter, sort } = userQuery(req)
    const p = page(req.query.page)
    const { total, users } = queryUsers(q, filter, sort, PAGE_SIZE, (p - 1) * PAGE_SIZE)
    const now = Date.now()
    const count = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { n: number }).n
    const result: AdminUserPage = {
      users,
      total,
      page: p,
      pageSize: PAGE_SIZE,
      stats: {
        total: count('SELECT COUNT(*) AS n FROM users'),
        members: count('SELECT COUNT(*) AS n FROM subscriptions WHERE current_period_end IS NULL OR current_period_end > ?', now),
        paying: count("SELECT COUNT(*) AS n FROM subscriptions WHERE source NOT IN ('comp', 'test') AND (current_period_end IS NULL OR current_period_end > ?)", now),
        comp: count("SELECT COUNT(*) AS n FROM subscriptions WHERE source = 'comp' AND (current_period_end IS NULL OR current_period_end > ?)", now),
        expired: count('SELECT COUNT(*) AS n FROM subscriptions WHERE current_period_end IS NOT NULL AND current_period_end <= ?', now),
        admins: count('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1'),
        new7d: count('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 7 * DAY_MS),
      },
    }
    res.json(result)
  })

  router.get('/users.csv', (req, res) => {
    const { q, filter, sort } = userQuery(req)
    const { users } = queryUsers(q, filter, sort, 100_000, 0)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="bingetube-users-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send(
      csv([
        ['id', 'email', 'name', 'joined', 'membership', 'access_until', 'paid_orders', 'total_spent_usd', 'views_30d', 'last_watched', 'sign_in', 'admin'],
        ...users.map((u) => [
          u.id,
          u.email,
          u.name,
          iso(u.createdAt),
          u.subscription ? u.subscription.source : 'none',
          u.subscription ? (u.subscription.currentPeriodEnd ? iso(u.subscription.currentPeriodEnd) : 'no end') : '',
          u.paidOrders,
          (u.totalSpentCents / 100).toFixed(2),
          u.views30d,
          iso(u.lastWatchedAt),
          u.signInMethods.join('+'),
          u.isAdmin ? 'yes' : '',
        ]),
      ]),
    )
  })

  router.get('/users/:id', (req, res) => {
    const id = int(req.params.id, 'User', { min: 1 })
    const user = userRow(id)
    const detail: AdminUserDetail = {
      user,
      profiles: db
        .prepare(
          `SELECT pr.id, pr.name, pr.color,
             (SELECT COUNT(*) FROM my_list l WHERE l.profile_id = pr.id) AS listCount,
             (SELECT COUNT(*) FROM progress p WHERE p.profile_id = pr.id) AS watching
           FROM profiles pr WHERE pr.user_id = ? ORDER BY pr.id`,
        )
        .all(id) as AdminUserDetail['profiles'],
      orders: (db.prepare('SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 50').all(id) as unknown as OrderRowDb[]).map(
        (o) => toOrder(o),
      ),
      recentViews: db
        .prepare(
          `SELECT v.series_id AS seriesId, COALESCE(s.title, v.series_id) AS seriesTitle, v.episode_number AS episodeNumber, v.created_at AS at
           FROM episode_views v JOIN profiles pr ON pr.id = v.profile_id LEFT JOIN series s ON s.id = v.series_id
           WHERE pr.user_id = ? ORDER BY v.created_at DESC LIMIT 20`,
        )
        .all(id) as AdminUserDetail['recentViews'],
      activeSessions: (db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?').get(id, Date.now()) as { n: number }).n,
      activity: (db
        .prepare('SELECT id, admin_email AS adminEmail, action, target, detail, created_at AS createdAt FROM admin_actions WHERE target = ? ORDER BY created_at DESC LIMIT 20')
        .all(`user:${id}`) as unknown) as AdminActivity[],
    }
    res.json(detail)
  })

  router.patch('/users/:id', (req, res) => {
    const id = int(req.params.id, 'User', { min: 1 })
    const before = userRow(id)
    if (typeof req.body?.isAdmin === 'boolean') {
      if (id === req.user!.id && !req.body.isAdmin) throw new HttpError(400, "You can't remove your own admin access")
      db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(req.body.isAdmin ? 1 : 0, id)
      if (before.isAdmin !== req.body.isAdmin) logAdmin(req, req.body.isAdmin ? 'Made admin' : 'Removed admin', `user:${id}`, before.email)
    }
    if (req.body?.name !== undefined) {
      const name = str(req.body.name, 'Name', { min: 1, max: 40 })
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id)
      if (name !== before.name) logAdmin(req, 'Renamed user', `user:${id}`, `${before.name} → ${name}`)
    }
    res.json(userRow(id))
  })

  /**
   * Grants complimentary access. Days are added on top of any time the user already has, so a gift never
   * shortens a paid pass; days = null means no end date.
   */
  router.post('/users/:id/access', (req, res) => {
    const id = int(req.params.id, 'User', { min: 1 })
    const user = userRow(id)
    const plan = req.body?.plan ? getPlan(String(req.body.plan)) : MEMBERSHIP
    if (!plan) throw new HttpError(400, 'Unknown plan')
    const days = req.body?.days === null ? null : int(req.body?.days, 'Days', { min: 1, max: 3650 })
    const now = Date.now()
    const sub = user.subscription
    const remaining = sub && (sub.currentPeriodEnd === null || sub.currentPeriodEnd > now)
    if (remaining && sub!.currentPeriodEnd === null && days !== null) throw new HttpError(400, 'This user already has access with no end date')
    const base = remaining && sub!.currentPeriodEnd ? sub!.currentPeriodEnd : now
    const end = days === null ? null : base + days * DAY_MS
    // Keep "crypto" when stacking on a paid pass so reporting still counts the paying member.
    const source = remaining && sub!.source !== 'comp' ? sub!.source : 'comp'
    db.prepare(
      `INSERT INTO subscriptions (user_id, plan, current_period_end, source, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, current_period_end = excluded.current_period_end,
         source = excluded.source, updated_at = excluded.updated_at`,
    ).run(id, plan.id, end, source, now)
    logAdmin(req, 'Granted access', `user:${id}`, `${user.email} · ${days === null ? 'no end date' : `+${days} days → ${new Date(end!).toISOString().slice(0, 10)}`}`)
    res.json(userRow(id))
  })

  router.delete('/users/:id/access', (req, res) => {
    const id = int(req.params.id, 'User', { min: 1 })
    const user = userRow(id)
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(id)
    if (user.subscription) {
      const until = user.subscription.currentPeriodEnd ? new Date(user.subscription.currentPeriodEnd).toISOString().slice(0, 10) : 'no end date'
      logAdmin(req, 'Revoked access', `user:${id}`, `${user.email} · was ${user.subscription.source} until ${until}`)
    }
    res.json(userRow(id))
  })

  router.post('/users/:id/sign-out', (req, res) => {
    const id = int(req.params.id, 'User', { min: 1 })
    const user = userRow(id)
    const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    logAdmin(req, 'Signed out everywhere', `user:${id}`, `${user.email} · ${changes} session${changes === 1 ? '' : 's'}`)
    res.json({ ok: true, sessions: Number(changes) })
  })

  router.delete('/users/:id', (req, res) => {
    const id = int(req.params.id, 'User', { min: 1 })
    const user = userRow(id)
    if (id === req.user!.id) throw new HttpError(400, "You can't delete your own account here")
    if (user.isAdmin) throw new HttpError(400, 'Remove admin access before deleting this account')
    transaction(() => {
      db.prepare('DELETE FROM users WHERE id = ?').run(id)
      logAdmin(req, 'Deleted user', `user:${id}`, `${user.email} · spent ${(user.totalSpentCents / 100).toFixed(2)} USD`)
    })
    res.json({ ok: true })
  })

  router.get('/orders', (req, res) => {
    const p = page(req.query.page)
    const result: AdminOrderPage = { ...queryOrders(req, PAGE_SIZE, (p - 1) * PAGE_SIZE), page: p, pageSize: PAGE_SIZE }
    res.json(result)
  })

  router.get('/orders.csv', (req, res) => {
    const { orders } = queryOrders(req, 100_000, 0)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="bingetube-orders-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send(
      csv([
        ['order_id', 'email', 'months', 'amount_usd', 'status', 'provider', 'coin', 'invoice_id', 'created', 'paid'],
        ...orders.map((o) => [o.id, o.email, o.months, (o.amountCents / 100).toFixed(2), o.status, o.provider, o.payCurrency ?? '', o.providerInvoiceId ?? '', iso(o.createdAt), iso(o.paidAt)]),
      ]),
    )
  })

  /** Manually confirm an order, e.g. an underpaid invoice the customer topped up off-platform. */
  router.post('/orders/:id/mark-paid', (req, res) => {
    const order = db.prepare('SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?').get(req.params.id as string) as
      | OrderRowDb
      | undefined
    if (!order) throw new HttpError(404, 'Order not found')
    if (order.status === 'paid') throw new HttpError(400, 'Order is already paid')
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 200) : ''
    fulfillOrder(order.id)
    logAdmin(req, 'Marked order paid', `order:${order.id}`, `${order.email ?? ''} · $${(order.amount_cents / 100).toFixed(2)}${note ? ` · ${note}` : ''}`)
    if (order.user_id) logAdmin(req, 'Marked order paid', `user:${order.user_id}`, `Order ${order.id}${note ? ` · ${note}` : ''}`)
    res.json({ ok: true })
  })

  router.get('/activity', (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100))
    res.json(
      db
        .prepare('SELECT id, admin_email AS adminEmail, action, target, detail, created_at AS createdAt FROM admin_actions ORDER BY created_at DESC LIMIT ?')
        .all(limit),
    )
  })
}
