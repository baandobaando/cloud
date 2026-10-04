// In-browser stand-in for the ReelFlix API, used by the shareable demo build.
// It mirrors the real server's routes and rules closely enough to click through every flow;
// data lives in this browser only.
import {
  DURATIONS,
  GENRES,
  MEMBERSHIP,
  RATINGS,
  getPlan,
  priceFor,
  type AdminSeries,
  type AdminSeriesDetail,
  type AdminStats,
  type AdminUser,
  type Genre,
  type Me,
  type OrderStatus,
  type OrderView,
  type PlanId,
  type Profile,
  type ProfileState,
  type SeriesDetail,
  type SeriesInput,
  type SeriesSummary,
  type SubscriptionView,
  type WatchProgress,
} from '../../shared/types'
import { SEED_SERIES } from '../../server/seed'
import { ApiError } from '../apiError'
import clip1 from './clips/clip1.mp4'
import clip2 from './clips/clip2.mp4'
import clip3 from './clips/clip3.mp4'
import clip4 from './clips/clip4.mp4'
import clip5 from './clips/clip5.mp4'
import webm1 from './clips/clip1.webm'
import webm2 from './clips/clip2.webm'
import webm3 from './clips/clip3.webm'
import webm4 from './clips/clip4.webm'
import webm5 from './clips/clip5.webm'

// Each clip ships as H.264 MP4 and VP9 WebM; use whichever this browser can play.
const canPlayWebm = typeof document !== 'undefined' && !!document.createElement('video').canPlayType('video/webm; codecs="vp9"')
const canPlayMp4 = typeof document !== 'undefined' && !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"')
const CLIPS = canPlayMp4 || !canPlayWebm ? [clip1, clip2, clip3, clip4, clip5] : [webm1, webm2, webm3, webm4, webm5]
/** Episodes store a short reference to a bundled clip; the clip itself is too big to save per episode. */
const CLIP_PREFIX = 'demo-clip:'

function resolveVideo(url: string | null): string | null {
  if (url?.startsWith(CLIP_PREFIX)) return CLIPS[Number(url.slice(CLIP_PREFIX.length))] ?? null
  return url
}
const DAY = 24 * 60 * 60 * 1000
const STORAGE_KEY = 'reelflix-demo:v1'
const PROFILE_COLORS = ['#e50914', '#2563eb', '#16a34a', '#9333ea', '#f59e0b', '#db2777']

export const DEMO_ADMIN = { email: 'admin@reelflix.demo', password: 'admin12345' }

interface User {
  id: number
  email: string
  password: string
  name: string
  isAdmin: boolean
  createdAt: number
}

interface Episode {
  id: number
  number: number
  title: string
  durationSec: number
  videoUrl: string | null
}

interface Series extends Omit<AdminSeries, 'episodeCount'> {
  episodes: Episode[]
}

interface Order {
  id: string
  userId: number
  plan: PlanId
  months: number
  amountCents: number
  provider: string
  status: OrderStatus
  payCurrency: string | null
  createdAt: number
  paidAt: number | null
}

interface Payment {
  id: number
  userId: number
  amountCents: number
  plan: PlanId
  provider: string
  createdAt: number
}

interface DB {
  nextId: number
  sessionUserId: number | null
  users: User[]
  profiles: (Profile & { userId: number })[]
  state: Record<number, ProfileState>
  series: Series[]
  subs: Record<number, SubscriptionView>
  orders: Order[]
  payments: Payment[]
}

// ---------------------------------------------------------------- storage

let memory: DB | null = null

function seed(): DB {
  const now = Date.now()
  let id = 1
  const next = () => id++

  const series: Series[] = SEED_SERIES.map((s, i) => ({
    id: s.id,
    title: s.title,
    tagline: s.tagline,
    synopsis: s.synopsis,
    genres: s.genres,
    year: s.year,
    rating: s.rating,
    palette: s.palette,
    emoji: s.emoji,
    posterUrl: null,
    isNew: !!s.isNew,
    trendingRank: s.trendingRank ?? null,
    freeEpisodes: 5,
    published: true,
    createdAt: now - i * 1000,
    updatedAt: now - i * 1000,
    episodes: s.episodes.map((e, k) => ({
      id: next(),
      number: e.number,
      title: e.title,
      durationSec: 8,
      videoUrl: `${CLIP_PREFIX}${(k + i) % CLIPS.length}`,
    })),
  }))

  // A few example members so the admin dashboard has something to show.
  const examples: [string, PlanId, number, string, string][] = [
    ['maya.r@example.com', 'member', 3, 'nowpayments', 'USDT'],
    ['jordan.k@example.com', 'member', 12, 'btcpay', 'BTC'],
    ['sam.t@example.com', 'member', 1, 'nowpayments', 'ETH'],
    ['lee.w@example.com', 'member', 1, 'btcpay', 'BTC'],
  ]
  const users: User[] = [
    { id: next(), email: DEMO_ADMIN.email, password: DEMO_ADMIN.password, name: 'Admin', isAdmin: true, createdAt: now - 40 * DAY },
  ]
  const profiles: DB['profiles'] = [{ id: next(), userId: users[0].id, name: 'Admin', color: PROFILE_COLORS[0] }]
  const subs: DB['subs'] = {}
  const orders: Order[] = []
  const payments: Payment[] = []
  const state: DB['state'] = {}

  examples.forEach(([email, plan, months, provider, coin], i) => {
    const createdAt = now - (20 - i * 4) * DAY
    const user: User = { id: next(), email, password: 'example', name: email.split('@')[0].split('.')[0], isAdmin: false, createdAt }
    users.push(user)
    const profile = { id: next(), userId: user.id, name: user.name, color: PROFILE_COLORS[(i + 1) % PROFILE_COLORS.length] }
    profiles.push(profile)
    state[profile.id] = {
      myList: [],
      progress: { [series[i].id]: { episodeNumber: 3 + i * 4, position: 0, updatedAt: createdAt } },
    }
    const amountCents = priceFor(getPlan(plan)!, months)
    const paidAt = createdAt + 3600_000
    const orderId = `example-${i + 1}`
    orders.push({ id: orderId, userId: user.id, plan, months, amountCents, provider, status: 'paid', payCurrency: coin, createdAt, paidAt })
    payments.push({ id: next(), userId: user.id, amountCents, plan, provider, createdAt: paidAt })
    subs[user.id] = { plan, currentPeriodEnd: paidAt + months * 30 * DAY, source: 'crypto' }
  })
  orders.push({
    id: 'example-5',
    userId: users[1].id,
    plan: 'member',
    months: 3,
    amountCents: priceFor(MEMBERSHIP, 3),
    provider: 'nowpayments',
    status: 'expired',
    payCurrency: null,
    createdAt: now - 6 * DAY,
    paidAt: null,
  })

  return { nextId: id, sessionUserId: null, users, profiles, state, series, subs, orders, payments }
}

function load(): DB {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      // Files uploaded in an earlier visit only lived in that tab; drop the dead links.
      for (const s of parsed.series) {
        if (s.posterUrl?.startsWith('blob:')) s.posterUrl = null
        for (const e of s.episodes) if (e.videoUrl?.startsWith('blob:')) e.videoUrl = null
      }
      memory = parsed
      return parsed
    }
  } catch {
    /* storage unavailable or corrupt: start fresh in memory */
  }
  memory = seed()
  return memory
}

function save(db: DB) {
  memory = db
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* storage full or unavailable: keep working in memory for this visit */
  }
}

export function resetDemo() {
  memory = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- helpers

const fail = (status: number, message: string): never => {
  throw new ApiError(status, message)
}

const newId = (db: DB) => db.nextId++

function currentUser(db: DB): User | undefined {
  return db.users.find((u) => u.id === db.sessionUserId)
}

function requireUser(db: DB): User {
  return currentUser(db) ?? fail(401, 'Please sign in')
}

function requireAdmin(db: DB): User {
  const u = requireUser(db)
  if (!u.isAdmin) fail(403, 'Admins only')
  return u
}

const isActive = (s: SubscriptionView | undefined) => !!s && (s.currentPeriodEnd === null || s.currentPeriodEnd > Date.now())
const entitled = (db: DB, u: User | undefined) => !!u && (u.isAdmin || isActive(db.subs[u.id]))

function summary(s: Series): SeriesSummary {
  const { episodes, published: _p, createdAt: _c, updatedAt: _u, ...rest } = s
  return { ...rest, episodeCount: episodes.length }
}

function adminSeries(s: Series): AdminSeriesDetail {
  return {
    ...summary(s),
    published: s.published,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    episodes: s.episodes.map((e) => ({ ...e, videoUrl: resolveVideo(e.videoUrl) })),
  }
}

function findSeries(db: DB, id: string): Series {
  return db.series.find((s) => s.id === id) ?? fail(404, 'Series not found')
}

function findEpisode(db: DB, id: number): { series: Series; ep: Episode } {
  for (const series of db.series) {
    const ep = series.episodes.find((e) => e.id === id)
    if (ep) return { series, ep }
  }
  return fail(404, 'Episode not found')
}

function ownedProfile(db: DB, user: User, id: number) {
  return db.profiles.find((p) => p.id === id && p.userId === user.id) ?? fail(404, 'Profile not found')
}

function str(v: unknown, field: string, min = 0, max = 500): string {
  if (typeof v !== 'string') fail(400, `${field} is required`)
  const s = (v as string).trim()
  if (s.length < min) fail(400, min <= 1 ? `${field} is required` : `${field} must be at least ${min} characters`)
  if (s.length > max) fail(400, `${field} must be at most ${max} characters`)
  return s
}

function seriesInput(b: Record<string, unknown>): SeriesInput {
  if (!Array.isArray(b.genres) || !b.genres.length || !b.genres.every((g) => GENRES.includes(g as Genre))) fail(400, 'Pick at least one genre')
  if (!RATINGS.includes(b.rating as SeriesInput['rating'])) fail(400, 'Invalid rating')
  const free = Number(b.freeEpisodes)
  if (!Number.isInteger(free) || free < 0) fail(400, 'Free episodes must be a whole number ≥ 0')
  return {
    title: str(b.title, 'Title', 1, 120),
    tagline: str(b.tagline ?? '', 'Tagline', 0, 200),
    synopsis: str(b.synopsis ?? '', 'Synopsis', 0, 2000),
    genres: [...new Set(b.genres as Genre[])],
    year: Number(b.year) || new Date().getFullYear(),
    rating: b.rating as SeriesInput['rating'],
    palette: b.palette as [string, string],
    emoji: str(b.emoji ?? '🎬', 'Emoji', 1, 16),
    isNew: !!b.isNew,
    trendingRank: b.trendingRank === null || b.trendingRank === '' ? null : Number(b.trendingRank),
    freeEpisodes: free,
    published: !!b.published,
  }
}

function slugify(db: DB, title: string) {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'series'
  let slug = base
  for (let i = 2; db.series.some((s) => s.id === slug); i++) slug = `${base}-${i}`
  return slug
}

function me(db: DB, user: User): Me {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    subscription: db.subs[user.id] ?? null,
    isEntitled: entitled(db, user),
    profiles: db.profiles.filter((p) => p.userId === user.id).map(({ id, name, color }) => ({ id, name, color })),
  }
}

function orderView(o: Order): OrderView {
  const stale = o.status === 'pending' && Date.now() - o.createdAt > DAY
  return {
    id: o.id,
    plan: o.plan,
    months: o.months,
    amountCents: o.amountCents,
    provider: o.provider as OrderView['provider'],
    status: stale ? 'expired' : o.status,
    checkoutUrl: o.status === 'pending' ? `/billing/test-checkout/${o.id}` : null,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
  }
}

function fulfill(db: DB, order: Order, coin: string | null) {
  if (order.status === 'paid') return
  const now = Date.now()
  order.status = 'paid'
  order.paidAt = now
  order.payCurrency = coin
  const current = db.subs[order.userId]
  if (current && current.currentPeriodEnd === null) {
    current.plan = order.plan
  } else {
    const base = current?.currentPeriodEnd && current.currentPeriodEnd > now ? current.currentPeriodEnd : now
    db.subs[order.userId] = { plan: order.plan, currentPeriodEnd: base + order.months * 30 * DAY, source: order.provider === 'test' ? 'test' : 'crypto' }
  }
  db.payments.push({ id: newId(db), userId: order.userId, amountCents: order.amountCents, plan: order.plan, provider: order.provider, createdAt: now })
}

function adminUser(db: DB, u: User): AdminUser {
  return { id: u.id, email: u.email, name: u.name, isAdmin: u.isAdmin, createdAt: u.createdAt, subscription: db.subs[u.id] ?? null }
}

function createUser(db: DB, email: string, password: string, name: string): User {
  const user: User = { id: newId(db), email, password, name, isAdmin: false, createdAt: Date.now() }
  db.users.push(user)
  db.profiles.push({ id: newId(db), userId: user.id, name, color: PROFILE_COLORS[0] })
  return user
}

// ---------------------------------------------------------------- routes

type Handler = (db: DB, m: RegExpMatchArray, body: Record<string, unknown>) => unknown
const routes: [string, RegExp, Handler][] = []
const on = (method: string, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$'), handler])

on('GET', '/me', (db) => {
  const u = currentUser(db)
  return u ? me(db, u) : null
})

on('POST', '/auth/signup', (db, _m, b) => {
  const email = str(b.email, 'Email', 3, 254).toLowerCase()
  const password = str(b.password, 'Password', 8, 200)
  const name = str(b.name || email.split('@')[0], 'Name', 1, 40)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Please enter a valid email address')
  if (db.users.some((u) => u.email === email)) fail(409, 'An account with that email already exists. Try signing in.')
  db.sessionUserId = createUser(db, email, password, name).id
  return { ok: true }
})

on('POST', '/auth/login', (db, _m, b) => {
  const email = str(b.email, 'Email', 1).toLowerCase()
  const user = db.users.find((u) => u.email === email && u.password === b.password)
  if (!user) fail(401, 'Incorrect email or password')
  db.sessionUserId = user!.id
  return { ok: true }
})

on('POST', '/auth/logout', (db) => {
  db.sessionUserId = null
  return { ok: true }
})

on('POST', '/auth/password', (db, _m, b) => {
  const u = requireUser(db)
  if (u.password !== b.currentPassword) fail(400, 'Current password is incorrect')
  u.password = str(b.newPassword, 'New password', 8, 200)
  return { ok: true }
})

on('GET', '/catalog', (db) => db.series.filter((s) => s.published).sort((a, b) => b.createdAt - a.createdAt).map(summary))

on('GET', '/series/:id', (db, m) => {
  const s = findSeries(db, decodeURIComponent(m[1]))
  const u = currentUser(db)
  if (!s.published && !u?.isAdmin) fail(404, 'Series not found')
  const ok = entitled(db, u)
  const detail: SeriesDetail = {
    ...summary(s),
    episodes: s.episodes.map((e) => {
      const unlocked = ok || e.number <= s.freeEpisodes
      return { id: e.id, number: e.number, title: e.title, durationSec: e.durationSec, videoUrl: unlocked ? resolveVideo(e.videoUrl) : null, locked: !unlocked }
    }),
  }
  return detail
})

// Profiles
on('POST', '/profiles', (db, _m, b) => {
  const u = requireUser(db)
  const name = str(b.name, 'Name', 1, 16)
  const mine = db.profiles.filter((p) => p.userId === u.id)
  if (mine.length >= 5) fail(400, 'You can have up to 5 profiles')
  const p = { id: newId(db), userId: u.id, name, color: PROFILE_COLORS[mine.length % PROFILE_COLORS.length] }
  db.profiles.push(p)
  return { id: p.id, name, color: p.color }
})
on('PATCH', '/profiles/:id', (db, m, b) => {
  ownedProfile(db, requireUser(db), Number(m[1])).name = str(b.name, 'Name', 1, 16)
  return { ok: true }
})
on('DELETE', '/profiles/:id', (db, m) => {
  const u = requireUser(db)
  const p = ownedProfile(db, u, Number(m[1]))
  if (db.profiles.filter((x) => x.userId === u.id).length <= 1) fail(400, 'You need at least one profile')
  db.profiles = db.profiles.filter((x) => x !== p)
  delete db.state[p.id]
  return { ok: true }
})
on('GET', '/profiles/:id/state', (db, m) => {
  const p = ownedProfile(db, requireUser(db), Number(m[1]))
  return db.state[p.id] ?? { myList: [], progress: {} }
})
on('PUT', '/profiles/:id/list/:sid', (db, m) => {
  const p = ownedProfile(db, requireUser(db), Number(m[1]))
  const sid = decodeURIComponent(m[2])
  findSeries(db, sid)
  const st = (db.state[p.id] ??= { myList: [], progress: {} })
  if (!st.myList.includes(sid)) st.myList.unshift(sid)
  return { ok: true }
})
on('DELETE', '/profiles/:id/list/:sid', (db, m) => {
  const p = ownedProfile(db, requireUser(db), Number(m[1]))
  const st = (db.state[p.id] ??= { myList: [], progress: {} })
  st.myList = st.myList.filter((x) => x !== decodeURIComponent(m[2]))
  return { ok: true }
})
on('PUT', '/profiles/:id/progress/:sid', (db, m, b) => {
  const p = ownedProfile(db, requireUser(db), Number(m[1]))
  const sid = decodeURIComponent(m[2])
  findSeries(db, sid)
  const st = (db.state[p.id] ??= { myList: [], progress: {} })
  st.progress[sid] = { episodeNumber: Number(b.episodeNumber), position: Number(b.position) || 0, updatedAt: Date.now() } satisfies WatchProgress
  return { ok: true }
})

// Billing
on('GET', '/billing/config', () => ({
  providers: [{ id: 'test', name: 'Test checkout', description: 'Demo — simulates a crypto payment, nothing is charged' }],
}))
on('POST', '/billing/orders', (db, _m, b) => {
  const u = requireUser(db)
  const plan = b.plan ? (getPlan(String(b.plan)) ?? fail(400, 'Unknown plan')) : MEMBERSHIP
  const months = Number(b.months)
  if (!DURATIONS.some((d) => d.months === months)) fail(400, 'Unsupported duration')
  if (b.provider !== 'test') fail(400, 'That payment method is not available')
  const order: Order = {
    id: crypto.randomUUID(),
    userId: u.id,
    plan: plan.id,
    months,
    amountCents: priceFor(plan, months),
    provider: 'test',
    status: 'pending',
    payCurrency: null,
    createdAt: Date.now(),
    paidAt: null,
  }
  db.orders.push(order)
  return { orderId: order.id, checkoutUrl: `/billing/test-checkout/${order.id}` }
})
on('GET', '/billing/orders', (db) => {
  const u = requireUser(db)
  return db.orders.filter((o) => o.userId === u.id).sort((a, b) => b.createdAt - a.createdAt).map(orderView)
})
on('GET', '/billing/orders/:id', (db, m) => {
  const u = requireUser(db)
  const o = db.orders.find((x) => x.id === m[1] && x.userId === u.id) ?? fail(404, 'Order not found')
  return orderView(o)
})
on('POST', '/billing/test/:id/pay', (db, m) => {
  const u = requireUser(db)
  const o = db.orders.find((x) => x.id === m[1] && x.userId === u.id) ?? fail(404, 'Order not found')
  if (orderView(o).status === 'expired') fail(400, 'This order has expired')
  fulfill(db, o, 'BTC')
  return { ok: true }
})

// Admin
on('GET', '/admin/stats', (db) => {
  requireAdmin(db)
  const now = Date.now()
  const active = Object.values(db.subs).filter(isActive)
  const passesByLength: Record<number, number> = Object.fromEntries(DURATIONS.map((d) => [d.months, 0]))
  db.orders.filter((o) => o.status === 'paid').forEach((o) => (passesByLength[o.months] = (passesByLength[o.months] ?? 0) + 1))
  const viewers = new Map<string, number>()
  Object.values(db.state).forEach((st) => Object.keys(st.progress).forEach((sid) => viewers.set(sid, (viewers.get(sid) ?? 0) + 1)))
  const stats: AdminStats = {
    users: db.users.length,
    newUsers7d: db.users.filter((u) => u.createdAt > now - 7 * DAY).length,
    activeSubscribers: active.length,
    passesByLength,
    mrrCents: active.length * MEMBERSHIP.priceCents,
    revenue30dCents: db.payments.filter((p) => p.createdAt > now - 30 * DAY && p.provider !== 'test').reduce((s, p) => s + p.amountCents, 0),
    seriesPublished: db.series.filter((s) => s.published).length,
    seriesDraft: db.series.filter((s) => !s.published).length,
    episodes: db.series.reduce((n, s) => n + s.episodes.length, 0),
    topSeries: db.series
      .map((s) => ({ id: s.id, title: s.title, viewers: viewers.get(s.id) ?? 0 }))
      .sort((a, b) => b.viewers - a.viewers || a.title.localeCompare(b.title))
      .slice(0, 5),
    recentPayments: [...db.payments]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((p) => ({ id: p.id, email: db.users.find((u) => u.id === p.userId)?.email ?? '(deleted user)', amountCents: p.amountCents, plan: p.plan, provider: p.provider, createdAt: p.createdAt })),
  }
  return stats
})
on('GET', '/admin/series', (db) => {
  requireAdmin(db)
  return [...db.series].sort((a, b) => b.updatedAt - a.updatedAt).map((s) => ({ ...summary(s), published: s.published, createdAt: s.createdAt, updatedAt: s.updatedAt }))
})
on('POST', '/admin/series', (db, _m, b) => {
  requireAdmin(db)
  const input = seriesInput(b)
  const now = Date.now()
  const s: Series = { ...input, id: slugify(db, input.title), posterUrl: null, createdAt: now, updatedAt: now, episodes: [] }
  db.series.push(s)
  return adminSeries(s)
})
on('GET', '/admin/series/:id', (db, m) => {
  requireAdmin(db)
  return adminSeries(findSeries(db, decodeURIComponent(m[1])))
})
on('PATCH', '/admin/series/:id', (db, m, b) => {
  requireAdmin(db)
  const s = findSeries(db, decodeURIComponent(m[1]))
  Object.assign(s, seriesInput(b), { updatedAt: Date.now() })
  return adminSeries(s)
})
on('DELETE', '/admin/series/:id', (db, m) => {
  requireAdmin(db)
  const s = findSeries(db, decodeURIComponent(m[1]))
  db.series = db.series.filter((x) => x !== s)
  return { ok: true }
})
on('DELETE', '/admin/series/:id/poster', (db, m) => {
  requireAdmin(db)
  const s = findSeries(db, decodeURIComponent(m[1]))
  s.posterUrl = null
  return adminSeries(s)
})
on('POST', '/admin/series/:id/episodes', (db, m, b) => {
  requireAdmin(db)
  const s = findSeries(db, decodeURIComponent(m[1]))
  const count = Math.min(200, Math.max(1, Number(b.count) || 1))
  for (let i = 0; i < count; i++) {
    const n = s.episodes.length + 1
    s.episodes.push({ id: newId(db), number: n, title: (typeof b.title === 'string' && b.title.trim()) || `Episode ${n}`, durationSec: 90, videoUrl: null })
  }
  s.updatedAt = Date.now()
  return adminSeries(s)
})
on('PATCH', '/admin/episodes/:id', (db, m, b) => {
  requireAdmin(db)
  const { series, ep } = findEpisode(db, Number(m[1]))
  let url = b.videoUrl === null || b.videoUrl === '' ? null : String(b.videoUrl)
  const clipIndex = url ? CLIPS.indexOf(url) : -1
  if (clipIndex >= 0) url = `${CLIP_PREFIX}${clipIndex}`
  else if (url && !/^https:\/\//i.test(url) && !url.startsWith('blob:')) fail(400, 'Video URL must start with https://')
  ep.title = str(b.title, 'Title', 1, 120)
  ep.durationSec = Number(b.durationSec) || ep.durationSec
  ep.videoUrl = url
  series.updatedAt = Date.now()
  return adminSeries(series)
})
on('POST', '/admin/episodes/:id/move', (db, m, b) => {
  requireAdmin(db)
  const { series, ep } = findEpisode(db, Number(m[1]))
  const other = series.episodes.find((e) => e.number === ep.number + (b.direction === 'up' ? -1 : 1))
  if (other) {
    ;[ep.number, other.number] = [other.number, ep.number]
    series.episodes.sort((a, c) => a.number - c.number)
  }
  return adminSeries(series)
})
on('DELETE', '/admin/episodes/:id', (db, m) => {
  requireAdmin(db)
  const { series, ep } = findEpisode(db, Number(m[1]))
  series.episodes = series.episodes.filter((e) => e !== ep).map((e, i) => ({ ...e, number: i + 1 }))
  return adminSeries(series)
})
on('GET', '/admin/users', (db) => {
  requireAdmin(db)
  const params = new URLSearchParams(lastQuery)
  const q = (params.get('q') ?? '').toLowerCase()
  const filter = params.get('filter')
  return [...db.users]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((u) => !q || u.email.includes(q) || u.name.toLowerCase().includes(q))
    .filter((u) => (filter === 'subscribers' ? isActive(db.subs[u.id]) : filter === 'admins' ? u.isAdmin : true))
    .map((u) => adminUser(db, u))
})
on('PATCH', '/admin/users/:id', (db, m, b) => {
  const me = requireAdmin(db)
  const u = db.users.find((x) => x.id === Number(m[1])) ?? fail(404, 'User not found')
  if (u.id === me.id && !b.isAdmin) fail(400, "You can't remove your own admin access")
  u.isAdmin = !!b.isAdmin
  return adminUser(db, u)
})
on('POST', '/admin/users/:id/access', (db, m, b) => {
  requireAdmin(db)
  const u = db.users.find((x) => x.id === Number(m[1])) ?? fail(404, 'User not found')
  const plan = b.plan ? (getPlan(String(b.plan)) ?? fail(400, 'Unknown plan')) : MEMBERSHIP
  db.subs[u.id] = { plan: plan.id, currentPeriodEnd: b.days === null ? null : Date.now() + Number(b.days) * DAY, source: 'comp' }
  return adminUser(db, u)
})
on('DELETE', '/admin/users/:id/access', (db, m) => {
  requireAdmin(db)
  const u = db.users.find((x) => x.id === Number(m[1])) ?? fail(404, 'User not found')
  delete db.subs[u.id]
  return adminUser(db, u)
})
on('GET', '/admin/orders', (db) => {
  requireAdmin(db)
  const status = new URLSearchParams(lastQuery).get('status')
  return [...db.orders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((o) => ({ ...o, status: orderView(o).status }))
    .filter((o) => !status || o.status === status)
    .map((o) => ({ ...o, email: db.users.find((u) => u.id === o.userId)?.email ?? '?', providerInvoiceId: o.provider === 'test' ? null : `inv_${o.id.slice(0, 10)}` }))
})
on('POST', '/admin/orders/:id/mark-paid', (db, m) => {
  requireAdmin(db)
  const o = db.orders.find((x) => x.id === m[1]) ?? fail(404, 'Order not found')
  if (o.status === 'paid') fail(400, 'Order is already paid')
  fulfill(db, o, null)
  return { ok: true }
})

let lastQuery = ''

/** Handles a JSON API call the same way the real server would. */
export async function mockRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 120)) // feel like a network call
  const [path, query = ''] = url.replace(/^\/api/, '').split('?')
  lastQuery = query
  const db = load()
  for (const [m, re, handler] of routes) {
    if (m !== method) continue
    const match = path.match(re)
    if (!match) continue
    const snapshot = JSON.stringify(db)
    try {
      const result = handler(db, match, (body as Record<string, unknown>) ?? {})
      save(db)
      return structuredClone(result) as T
    } catch (err) {
      memory = JSON.parse(snapshot) // roll back partial changes, like a DB transaction
      throw err
    }
  }
  throw new ApiError(404, 'Not found')
}

/** Uploads in the demo keep the file in this browser tab only (as a blob URL). */
export async function mockUpload<T>(url: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  for (const pct of [15, 40, 70, 100]) {
    await new Promise((r) => setTimeout(r, 120))
    onProgress?.(pct)
  }
  const file = form.get('file')
  if (!(file instanceof File)) throw new ApiError(400, 'No file uploaded')
  const db = load()
  requireAdmin(db)
  const objectUrl = URL.createObjectURL(file)
  const poster = url.match(/^\/admin\/series\/([^/]+)\/poster$/)
  if (poster) {
    if (!file.type.startsWith('image/')) fail(400, `Unsupported file type: ${file.type}`)
    const s = findSeries(db, decodeURIComponent(poster[1]))
    s.posterUrl = objectUrl
    save(db)
    return structuredClone(adminSeries(s)) as T
  }
  const video = url.match(/^\/admin\/episodes\/(\d+)\/video$/)
  if (video) {
    if (!file.type.startsWith('video/')) fail(400, `Unsupported file type: ${file.type}`)
    const { series, ep } = findEpisode(db, Number(video[1]))
    ep.videoUrl = objectUrl
    const d = Number(form.get('durationSec'))
    if (d > 0) ep.durationSec = Math.round(d)
    series.updatedAt = Date.now()
    save(db)
    return structuredClone(adminSeries(series)) as T
  }
  throw new ApiError(404, 'Not found')
}
