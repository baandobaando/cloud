import { ANALYTICS_RANGES, DURATIONS, MEMBERSHIP, getPlan, type AdminAnalytics, type AnalyticsRange, type Metric } from '../shared/types.ts'
import { db } from './db.ts'

const DAY = 86_400_000

/** Everything on the admin dashboard for one date range, compared with the range just before it. */
export function buildAnalytics(rangeId: string, now = Date.now()): AdminAnalytics {
  const range = ANALYTICS_RANGES.find((r) => r.id === rangeId) ?? ANALYTICS_RANGES[1]
  const periodMs = range.days * DAY
  const bucketMs = periodMs / range.buckets
  // Align to whole days so buckets don't shift every time the page is reloaded.
  const end = Math.ceil(now / DAY) * DAY
  const start = end - periodMs
  const prevStart = start - periodMs
  const buckets = Array.from({ length: range.buckets }, (_, i) => start + i * bucketMs)

  const all = <T>(sql: string, ...params: (string | number)[]) => db.prepare(sql).all(...params) as T[]
  const one = (sql: string, ...params: (string | number)[]) => (db.prepare(sql).get(...params) as { n: number }).n

  /** Sums `weight` of rows into the current period's buckets and into current/previous totals. */
  function metric<T extends { t: number }>(rows: T[], weight: (r: T) => number = () => 1): Metric {
    const series = new Array(range.buckets).fill(0)
    let value = 0
    let previous = 0
    for (const r of rows) {
      const w = weight(r)
      if (r.t >= start && r.t < end) {
        value += w
        series[Math.min(range.buckets - 1, Math.floor((r.t - start) / bucketMs))] += w
      } else if (r.t >= prevStart && r.t < start) {
        previous += w
      }
    }
    return { value, previous, series }
  }

  /** Distinct `key` per bucket and per period. */
  function distinct<T extends { t: number; k: number | string }>(rows: T[]): Metric {
    const sets = buckets.map(() => new Set<number | string>())
    const cur = new Set<number | string>()
    const prev = new Set<number | string>()
    for (const r of rows) {
      if (r.t >= start && r.t < end) {
        cur.add(r.k)
        sets[Math.min(range.buckets - 1, Math.floor((r.t - start) / bucketMs))].add(r.k)
      } else if (r.t >= prevStart && r.t < start) prev.add(r.k)
    }
    return { value: cur.size, previous: prev.size, series: sets.map((s) => s.size) }
  }

  const payments = all<{ t: number; amount: number; user_id: number | null; months: number | null; currency: string | null }>(
    `SELECT p.created_at AS t, p.amount_cents AS amount, p.user_id, o.months, o.pay_currency AS currency
     FROM payments p LEFT JOIN orders o ON o.id = p.order_id
     WHERE p.created_at >= ? AND COALESCE(p.provider, '') != 'test'`,
    prevStart,
  )
  const firstPayments = all<{ t: number }>(
    `SELECT MIN(created_at) AS t FROM payments WHERE COALESCE(provider, '') != 'test' AND user_id IS NOT NULL
     GROUP BY user_id HAVING MIN(created_at) >= ?`,
    prevStart,
  )
  const signups = all<{ t: number }>('SELECT created_at AS t FROM users WHERE created_at >= ?', prevStart)
  const views = all<{ t: number; k: number; series_id: string }>(
    'SELECT created_at AS t, profile_id AS k, series_id FROM episode_views WHERE created_at >= ?',
    prevStart,
  )
  const expiredRows = all<{ t: number }>(
    'SELECT current_period_end AS t FROM subscriptions WHERE current_period_end >= ? AND current_period_end < ?',
    prevStart,
    Math.min(end, now),
  )

  const kSignups = metric(signups)
  const kMembers = metric(firstPayments)
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)
  const expired = metric(expiredRows)

  // Funnel for people who signed up in this period.
  const cohort = 'SELECT id FROM users WHERE created_at >= ? AND created_at < ?'
  const funnel = [
    { label: 'Signed up', value: kSignups.value },
    {
      label: 'Watched an episode',
      value: one(
        `SELECT COUNT(DISTINCT pr.user_id) AS n FROM episode_views v JOIN profiles pr ON pr.id = v.profile_id WHERE pr.user_id IN (${cohort})`,
        start,
        end,
      ),
    },
    { label: 'Started checkout', value: one(`SELECT COUNT(DISTINCT user_id) AS n FROM orders WHERE user_id IN (${cohort})`, start, end) },
    {
      label: 'Paid',
      value: one(`SELECT COUNT(DISTINCT user_id) AS n FROM orders WHERE status = 'paid' AND user_id IN (${cohort})`, start, end),
    },
  ]

  const inPeriod = payments.filter((p) => p.t >= start && p.t < end)
  const passes = DURATIONS.map((d) => {
    const rows = inPeriod.filter((p) => (p.months ?? 1) === d.months)
    return { months: d.months, count: rows.length, revenueCents: rows.reduce((n, r) => n + r.amount, 0) }
  })
  const byCurrency = new Map<string, { count: number; revenueCents: number }>()
  for (const p of inPeriod) {
    const c = (p.currency || 'other').toUpperCase()
    const cur = byCurrency.get(c) ?? { count: 0, revenueCents: 0 }
    cur.count += 1
    cur.revenueCents += p.amount
    byCurrency.set(c, cur)
  }

  const viewCounts = new Map<string, { views: number; viewers: Set<number> }>()
  for (const v of views) {
    if (v.t < start || v.t >= end) continue
    const c = viewCounts.get(v.series_id) ?? { views: 0, viewers: new Set<number>() }
    c.views += 1
    c.viewers.add(v.k)
    viewCounts.set(v.series_id, c)
  }
  const titles = new Map(all<{ id: string; title: string }>('SELECT id, title FROM series').map((r) => [r.id, r.title]))
  const topSeries = [...viewCounts.entries()]
    .map(([id, c]) => ({ id, title: titles.get(id) ?? id, views: c.views, viewers: c.viewers.size }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8)

  const activeSubs = all<{ plan: string; source: string }>('SELECT plan, source FROM subscriptions WHERE current_period_end IS NULL OR current_period_end > ?', now)

  return {
    range: range.id as AnalyticsRange,
    buckets,
    bucketMs,
    kpis: {
      revenueCents: metric(payments, (p) => p.amount),
      signups: kSignups,
      newMembers: kMembers,
      payments: metric(payments),
      views: metric(views),
      activeViewers: distinct(views),
      conversion: { value: pct(kMembers.value, kSignups.value), previous: pct(kMembers.previous, kSignups.previous) },
      expired: { value: expired.value, previous: expired.previous },
    },
    totals: {
      users: one('SELECT COUNT(*) AS n FROM users'),
      activeMembers: activeSubs.length,
      // Run-rate counts paying members only; complimentary and test access don't bring in money.
      mrrCents: activeSubs.filter((s) => s.source === 'crypto').reduce((n, s) => n + (getPlan(s.plan) ?? MEMBERSHIP).priceCents, 0),
      seriesPublished: one('SELECT COUNT(*) AS n FROM series WHERE published = 1'),
      seriesDraft: one('SELECT COUNT(*) AS n FROM series WHERE published = 0'),
      episodes: one('SELECT COUNT(*) AS n FROM episodes'),
    },
    funnel,
    passes,
    currencies: [...byCurrency.entries()].map(([currency, c]) => ({ currency, ...c })).sort((a, b) => b.revenueCents - a.revenueCents),
    topSeries,
    expiringSoon: all<{ email: string; endsAt: number }>(
      `SELECT u.email, s.current_period_end AS endsAt FROM subscriptions s JOIN users u ON u.id = s.user_id
       WHERE s.current_period_end > ? AND s.current_period_end < ? ORDER BY s.current_period_end LIMIT 8`,
      now,
      now + 7 * DAY,
    ),
    recentPayments: all<{ id: number; email: string; amount_cents: number; plan: string | null; provider: string | null; created_at: number }>(
      `SELECT p.id, COALESCE(u.email, '(deleted user)') AS email, p.amount_cents, p.plan, p.provider, p.created_at
       FROM payments p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 8`,
    ).map((p) => ({ id: p.id, email: p.email, amountCents: p.amount_cents, plan: p.plan, provider: p.provider, createdAt: p.created_at })),
  }
}
