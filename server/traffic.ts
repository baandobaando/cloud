import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Router, type Request } from 'express'
import { ANALYTICS_RANGES, type AdminTraffic, type Metric } from '../shared/types.ts'
import { config } from './config.ts'
import { db } from './db.ts'
import { rateLimit } from './http.ts'

/**
 * First-party, cookie-free visit counting. A visitor is a hash of IP + browser + a secret that changes every day, so
 * the same person counts once per day without anything stored on their device and without a way to link days together.
 */

db.exec(`CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY,
  visitor TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT 'desktop',
  user_id INTEGER,
  created_at INTEGER NOT NULL
)`)
db.exec('CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at)')

const DAY = 86_400_000
const RETENTION_DAYS = 400
const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|embedly|curl|wget|python|httpclient|monitor|uptime/i
const OWN_HOSTS = new Set(['binge.tube', new URL(config.appUrl || 'http://localhost').hostname])

let secret: Buffer | null = null
function salt(day: number): Buffer {
  if (!secret) {
    const file = path.join(config.dataDir, 'visit-secret')
    try {
      secret = fs.readFileSync(file)
    } catch {
      secret = crypto.randomBytes(32)
      fs.mkdirSync(config.dataDir, { recursive: true })
      fs.writeFileSync(file, secret, { mode: 0o600 })
    }
  }
  return crypto.createHmac('sha256', secret).update(String(day)).digest()
}

function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip']
  if (typeof cf === 'string') return cf
  const fwd = req.headers['x-forwarded-for']
  return (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || req.ip || ''
}

function referrerHost(ref: unknown): string {
  if (typeof ref !== 'string' || !ref) return ''
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '').toLowerCase()
    return OWN_HOSTS.has(host) ? '' : host.slice(0, 100)
  } catch {
    return ''
  }
}

export const trafficRouter = Router()

/** Records one page view (sent by the app on every page change; nothing is returned). */
trafficRouter.post('/t', rateLimit({ windowMs: 60_000, max: 120 }), (req, res) => {
  res.status(204).end()
  const ua = String(req.headers['user-agent'] ?? '')
  const raw = typeof req.body?.path === 'string' ? req.body.path : ''
  if (!ua || BOTS.test(ua) || !raw.startsWith('/') || raw.startsWith('/admin')) return
  const now = Date.now()
  const day = Math.floor(now / DAY)
  const visitor = crypto.createHash('sha256').update(salt(day)).update(clientIp(req)).update(ua).digest('base64url').slice(0, 22)
  const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop'
  const country = String(req.headers['cf-ipcountry'] ?? '').slice(0, 2).toUpperCase().replace(/[^A-Z]/g, '')
  db.prepare('INSERT INTO page_views (visitor, path, referrer, country, device, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    visitor,
    raw.split(/[?#]/)[0].slice(0, 200),
    referrerHost(req.body?.ref),
    country === 'XX' || country === 'T1' ? '' : country,
    device,
    req.user?.id ?? null,
    now,
  )
})

/** Drops page views older than the retention window. */
export function pruneTraffic() {
  db.prepare('DELETE FROM page_views WHERE created_at < ?').run(Date.now() - RETENTION_DAYS * DAY)
}

/** Visitors and page views for one date range, compared with the range before it. */
export function buildTraffic(rangeId: string, now = Date.now()): AdminTraffic {
  const range = ANALYTICS_RANGES.find((r) => r.id === rangeId) ?? ANALYTICS_RANGES[1]
  const periodMs = range.days * DAY
  const bucketMs = periodMs / range.buckets
  const end = Math.ceil(now / DAY) * DAY
  const start = end - periodMs
  const prevStart = start - periodMs
  const buckets = Array.from({ length: range.buckets }, (_, i) => start + i * bucketMs)
  const bucketOf = (t: number) => Math.min(range.buckets - 1, Math.floor((t - start) / bucketMs))

  const views = db
    .prepare('SELECT visitor, path, referrer, country, device, user_id, created_at AS t FROM page_views WHERE created_at >= ?')
    .all(prevStart) as { visitor: string; path: string; referrer: string; country: string; device: string; user_id: number | null; t: number }[]

  // A visitor is unique per day (the hash changes daily), so period totals add up daily uniques.
  const pageviews: Metric = { value: 0, previous: 0, series: new Array(range.buckets).fill(0) }
  const visitors: Metric = { value: 0, previous: 0, series: new Array(range.buckets).fill(0) }
  const seenDay = new Set<string>()
  const seenBucket = new Set<string>()
  const cur = views.filter((v) => v.t >= start && v.t < end)
  for (const v of views) {
    const inCur = v.t >= start && v.t < end
    const dayKey = `${Math.floor(v.t / DAY)}:${v.visitor}`
    const firstToday = !seenDay.has(dayKey)
    seenDay.add(dayKey)
    if (inCur) {
      pageviews.value++
      pageviews.series[bucketOf(v.t)]++
      const bKey = `${bucketOf(v.t)}:${dayKey}`
      if (!seenBucket.has(bKey)) {
        seenBucket.add(bKey)
        visitors.series[bucketOf(v.t)]++
      }
      if (firstToday) visitors.value++
    } else if (v.t >= prevStart && v.t < start) {
      pageviews.previous++
      if (firstToday) visitors.previous++
    }
  }

  const count = (sql: string, from: number, to: number) => (db.prepare(sql).get(from, to) as { n: number }).n
  const signupSql = 'SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?'
  const trialSql = "SELECT COUNT(*) AS n FROM orders WHERE kind = 'subscription' AND status = 'paid' AND created_at >= ? AND created_at < ?"
  const signups = { value: count(signupSql, start, end), previous: count(signupSql, prevStart, start) }
  const subscribed = { value: count(trialSql, start, end), previous: count(trialSql, prevStart, start) }
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)

  const tally = (key: (v: (typeof cur)[number]) => string, limit = 10) => {
    const m = new Map<string, { views: number; visitors: Set<string> }>()
    for (const v of cur) {
      const k = key(v)
      if (!k) continue
      const e = m.get(k) ?? { views: 0, visitors: new Set<string>() }
      e.views++
      e.visitors.add(`${Math.floor(v.t / DAY)}:${v.visitor}`)
      m.set(k, e)
    }
    return [...m.entries()]
      .map(([label, e]) => ({ label, views: e.views, visitors: e.visitors.size }))
      .sort((a, b) => b.visitors - a.visitors || b.views - a.views)
      .slice(0, limit)
  }

  const seriesTitles = new Map(
    (db.prepare('SELECT id, title FROM series').all() as { id: string; title: string }[]).map((s) => [s.id, s.title]),
  )
  const topSeries = tally((v) => /^\/(?:title|watch)\/([^/]+)/.exec(v.path)?.[1] ?? '', 10).map((r) => ({
    ...r,
    id: r.label,
    label: seriesTitles.get(r.label) ?? r.label,
  }))
  const section = (p: string) =>
    p === '/' ? 'Home' : /^\/title\//.test(p) ? 'Show pages' : /^\/watch\//.test(p) ? 'Player' : p.split('/').slice(0, 2).join('/')

  return {
    range: range.id,
    buckets,
    bucketMs,
    kpis: {
      visitors,
      pageviews,
      viewsPerVisitor: { value: visitors.value ? pageviews.value / visitors.value : 0, previous: visitors.previous ? pageviews.previous / visitors.previous : 0 },
      signups,
      signupRate: { value: pct(signups.value, visitors.value), previous: pct(signups.previous, visitors.previous) },
      subscribed,
    },
    liveNow: new Set(views.filter((v) => v.t >= now - 5 * 60_000).map((v) => v.visitor)).size,
    topPages: tally((v) => section(v.path), 10),
    topSeries,
    referrers: tally((v) => v.referrer || 'Direct / unknown', 10),
    countries: tally((v) => v.country || '??', 10),
    devices: tally((v) => v.device, 3),
    signedIn: { value: new Set(cur.filter((v) => v.user_id).map((v) => v.user_id)).size },
  }
}
