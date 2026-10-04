import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Router, type Request } from 'express'
import multer from 'multer'
import {
  DURATIONS,
  GENRES,
  MEMBERSHIP,
  RATINGS,
  getPlan,
  type AdminSeriesDetail,
  type AdminStats,
  type AdminUser,
  type Genre,
  type Rating,
  type SeriesInput,
} from '../shared/types.ts'
import { requireAdmin } from './auth.ts'
import { fulfillOrder } from './billing.ts'
import { mediaDirs } from './catalog.ts'
import { db, transaction } from './db.ts'
import { HttpError, bool, int, str } from './http.ts'
import {
  SERIES_SELECT,
  getSubscription,
  isActive,
  toAdminEpisode,
  toAdminSeries,
  type EpisodeRow,
  type SeriesRow,
} from './models.ts'

export const adminRouter = Router()
adminRouter.use(requireAdmin)

const DAY_MS = 24 * 60 * 60 * 1000
const HEX = /^#[0-9a-fA-F]{6}$/

// ----- Helpers -----

function slugify(title: string): string {
  const base =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'series'
  let slug = base
  for (let i = 2; db.prepare('SELECT 1 FROM series WHERE id = ?').get(slug); i++) slug = `${base}-${i}`
  return slug
}

function parseSeriesInput(body: Record<string, unknown> | undefined): SeriesInput {
  if (!body) throw new HttpError(400, 'Missing body')
  const genres = body.genres
  if (!Array.isArray(genres) || genres.length === 0 || !genres.every((g) => GENRES.includes(g as Genre))) {
    throw new HttpError(400, 'Pick at least one genre')
  }
  if (!RATINGS.includes(body.rating as Rating)) throw new HttpError(400, 'Invalid rating')
  const palette = body.palette
  if (!Array.isArray(palette) || palette.length !== 2 || !palette.every((c) => typeof c === 'string' && HEX.test(c))) {
    throw new HttpError(400, 'Palette must be two hex colors')
  }
  const trendingRank = body.trendingRank === null || body.trendingRank === '' || body.trendingRank === undefined
    ? null
    : int(body.trendingRank, 'Trending rank', { min: 1, max: 100 })
  return {
    title: str(body.title, 'Title', { min: 1, max: 120 }),
    tagline: str(body.tagline ?? '', 'Tagline', { max: 200 }),
    synopsis: str(body.synopsis ?? '', 'Synopsis', { max: 2000 }),
    genres: [...new Set(genres as Genre[])],
    year: int(body.year, 'Year', { min: 1900, max: 2100 }),
    rating: body.rating as Rating,
    palette: palette as [string, string],
    emoji: str(body.emoji ?? '🎬', 'Emoji', { min: 1, max: 16 }),
    isNew: bool(body.isNew, 'New'),
    trendingRank,
    freeEpisodes: int(body.freeEpisodes, 'Free episodes', { min: 0, max: 1000 }),
    published: bool(body.published, 'Published'),
  }
}

function seriesRow(id: string): SeriesRow {
  const row = db.prepare(`${SERIES_SELECT} WHERE s.id = ?`).get(id) as SeriesRow | undefined
  if (!row) throw new HttpError(404, 'Series not found')
  return row
}

function seriesDetail(id: string): AdminSeriesDetail {
  const row = seriesRow(id)
  const eps = db.prepare('SELECT * FROM episodes WHERE series_id = ? ORDER BY number').all(id) as unknown as EpisodeRow[]
  return { ...toAdminSeries(row), episodes: eps.map(toAdminEpisode) }
}

function episodeRow(req: Request): EpisodeRow {
  const id = int(req.params.id, 'Episode', { min: 1 })
  const row = db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as EpisodeRow | undefined
  if (!row) throw new HttpError(404, 'Episode not found')
  return row
}

const touch = (seriesId: string) => db.prepare('UPDATE series SET updated_at = ? WHERE id = ?').run(Date.now(), seriesId)

/** Deletes a file we stored under /media/..., ignoring external URLs. */
function removeLocalMedia(url: string | null) {
  if (!url) return
  const match = /^\/media\/(episodes|posters)\/([a-zA-Z0-9_-]+\.[a-z0-9]{2,5})$/.exec(url)
  if (!match) return
  const dir = mediaDirs[match[1] as keyof typeof mediaDirs]
  fs.rm(path.join(dir, match[2]), { force: true }, () => {})
}

function validateVideoUrl(value: unknown): string | null {
  if (value === null || value === '') return null
  const url = str(value, 'Video URL', { max: 2000 })
  if (!/^https:\/\//i.test(url) && !url.startsWith('/media/episodes/')) {
    throw new HttpError(400, 'Video URL must start with https://')
  }
  return url
}

function uploader(dir: string, mimes: RegExp, maxBytes: number) {
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin'
        cb(null, `${crypto.randomUUID()}${ext.slice(0, 6)}`)
      },
    }),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (mimes.test(file.mimetype)) cb(null, true)
      else cb(new HttpError(400, `Unsupported file type: ${file.mimetype}`))
    },
  }).single('file')
}

const videoUpload = uploader(mediaDirs.episodes, /^video\/(mp4|webm|quicktime|x-m4v)$/, 2 * 1024 ** 3)
const posterUpload = uploader(mediaDirs.posters, /^image\/(jpeg|png|webp|avif)$/, 10 * 1024 ** 2)

// ----- Dashboard -----

adminRouter.get('/stats', (_req, res) => {
  const now = Date.now()
  const count = (sql: string, ...params: (string | number)[]) => (db.prepare(sql).get(...params) as { n: number }).n

  const activeSubs = db
    .prepare('SELECT plan FROM subscriptions WHERE current_period_end IS NULL OR current_period_end > ?')
    .all(now) as { plan: string }[]
  const mrrCents = activeSubs.reduce((sum, s) => sum + (getPlan(s.plan) ?? MEMBERSHIP).priceCents, 0)
  const passesByLength: Record<number, number> = Object.fromEntries(DURATIONS.map((d) => [d.months, 0]))
  for (const r of db.prepare("SELECT months, COUNT(*) AS n FROM orders WHERE status = 'paid' GROUP BY months").all() as { months: number; n: number }[]) {
    passesByLength[r.months] = r.n
  }

  const stats: AdminStats = {
    users: count('SELECT COUNT(*) AS n FROM users'),
    newUsers7d: count('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', now - 7 * DAY_MS),
    activeSubscribers: activeSubs.length,
    passesByLength,
    mrrCents,
    revenue30dCents:
      (db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE created_at > ? AND provider != 'test'").get(
        now - 30 * DAY_MS,
      ) as { n: number }).n,
    seriesPublished: count('SELECT COUNT(*) AS n FROM series WHERE published = 1'),
    seriesDraft: count('SELECT COUNT(*) AS n FROM series WHERE published = 0'),
    episodes: count('SELECT COUNT(*) AS n FROM episodes'),
    topSeries: db
      .prepare(
        `SELECT s.id, s.title, COUNT(p.profile_id) AS viewers FROM series s
         LEFT JOIN progress p ON p.series_id = s.id GROUP BY s.id ORDER BY viewers DESC, s.title LIMIT 5`,
      )
      .all() as AdminStats['topSeries'],
    recentPayments: (
      db
        .prepare(
          `SELECT p.id, COALESCE(u.email, '(deleted user)') AS email, p.amount_cents, p.plan, p.provider, p.created_at
           FROM payments p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 10`,
        )
        .all() as { id: number; email: string; amount_cents: number; plan: string | null; provider: string | null; created_at: number }[]
    ).map((p) => ({ id: p.id, email: p.email, amountCents: p.amount_cents, plan: p.plan, provider: p.provider, createdAt: p.created_at })),
  }
  res.json(stats)
})

// ----- Series -----

adminRouter.get('/series', (_req, res) => {
  const rows = db.prepare(`${SERIES_SELECT} ORDER BY s.updated_at DESC`).all() as unknown as SeriesRow[]
  res.json(rows.map(toAdminSeries))
})

adminRouter.post('/series', (req, res) => {
  const input = parseSeriesInput(req.body)
  const id = slugify(input.title)
  const now = Date.now()
  db.prepare(
    `INSERT INTO series (id, title, tagline, synopsis, genres, year, rating, palette, emoji, is_new, trending_rank,
       free_episodes, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.title, input.tagline, input.synopsis, JSON.stringify(input.genres), input.year, input.rating,
    JSON.stringify(input.palette), input.emoji, input.isNew ? 1 : 0, input.trendingRank, input.freeEpisodes,
    input.published ? 1 : 0, now, now)
  res.status(201).json(seriesDetail(id))
})

adminRouter.get('/series/:id', (req, res) => {
  res.json(seriesDetail(req.params.id as string))
})

adminRouter.patch('/series/:id', (req, res) => {
  const id = seriesRow(req.params.id as string).id
  const input = parseSeriesInput(req.body)
  db.prepare(
    `UPDATE series SET title = ?, tagline = ?, synopsis = ?, genres = ?, year = ?, rating = ?, palette = ?, emoji = ?,
       is_new = ?, trending_rank = ?, free_episodes = ?, published = ?, updated_at = ? WHERE id = ?`,
  ).run(input.title, input.tagline, input.synopsis, JSON.stringify(input.genres), input.year, input.rating,
    JSON.stringify(input.palette), input.emoji, input.isNew ? 1 : 0, input.trendingRank, input.freeEpisodes,
    input.published ? 1 : 0, Date.now(), id)
  res.json(seriesDetail(id))
})

adminRouter.delete('/series/:id', (req, res) => {
  const row = seriesRow(req.params.id as string)
  const videos = db.prepare('SELECT video_url FROM episodes WHERE series_id = ?').all(row.id) as { video_url: string | null }[]
  db.prepare('DELETE FROM series WHERE id = ?').run(row.id)
  videos.forEach((v) => removeLocalMedia(v.video_url))
  removeLocalMedia(row.poster_url)
  res.json({ ok: true })
})

adminRouter.post('/series/:id/poster', posterUpload, (req, res) => {
  const row = seriesRow(req.params.id as string)
  if (!req.file) throw new HttpError(400, 'No file uploaded')
  db.prepare('UPDATE series SET poster_url = ?, updated_at = ? WHERE id = ?').run(
    `/media/posters/${req.file.filename}`,
    Date.now(),
    row.id,
  )
  removeLocalMedia(row.poster_url)
  res.json(seriesDetail(row.id))
})

adminRouter.delete('/series/:id/poster', (req, res) => {
  const row = seriesRow(req.params.id as string)
  db.prepare('UPDATE series SET poster_url = NULL, updated_at = ? WHERE id = ?').run(Date.now(), row.id)
  removeLocalMedia(row.poster_url)
  res.json(seriesDetail(row.id))
})

// ----- Episodes -----

/** Appends one or more episodes to the end of a series. */
adminRouter.post('/series/:id/episodes', (req, res) => {
  const seriesId = seriesRow(req.params.id as string).id
  const count = int(req.body?.count ?? 1, 'Count', { min: 1, max: 200 })
  const title = req.body?.title ? str(req.body.title, 'Title', { max: 120 }) : ''
  const videoUrl = validateVideoUrl(req.body?.videoUrl ?? null)
  transaction(() => {
    const { last } = db.prepare('SELECT COALESCE(MAX(number), 0) AS last FROM episodes WHERE series_id = ?').get(seriesId) as {
      last: number
    }
    const insert = db.prepare('INSERT INTO episodes (series_id, number, title, duration_sec, video_url) VALUES (?, ?, ?, 90, ?)')
    for (let i = 1; i <= count; i++) {
      const n = last + i
      insert.run(seriesId, n, title || `Episode ${n}`, count === 1 ? videoUrl : null)
    }
    touch(seriesId)
  })
  res.status(201).json(seriesDetail(seriesId))
})

adminRouter.patch('/episodes/:id', (req, res) => {
  const ep = episodeRow(req)
  const title = str(req.body?.title, 'Title', { min: 1, max: 120 })
  const durationSec = int(req.body?.durationSec, 'Duration', { min: 1, max: 6 * 3600 })
  const videoUrl = validateVideoUrl(req.body?.videoUrl ?? null)
  db.prepare('UPDATE episodes SET title = ?, duration_sec = ?, video_url = ? WHERE id = ?').run(title, durationSec, videoUrl, ep.id)
  if (ep.video_url !== videoUrl) removeLocalMedia(ep.video_url)
  touch(ep.series_id)
  res.json(seriesDetail(ep.series_id))
})

adminRouter.post('/episodes/:id/video', videoUpload, (req, res) => {
  const ep = episodeRow(req)
  if (!req.file) throw new HttpError(400, 'No file uploaded')
  const duration = req.body?.durationSec ? int(Math.round(Number(req.body.durationSec)), 'Duration', { min: 1 }) : ep.duration_sec
  db.prepare('UPDATE episodes SET video_url = ?, duration_sec = ? WHERE id = ?').run(
    `/media/episodes/${req.file.filename}`,
    duration,
    ep.id,
  )
  removeLocalMedia(ep.video_url)
  touch(ep.series_id)
  res.json(seriesDetail(ep.series_id))
})

/** Swaps an episode with its neighbour. */
adminRouter.post('/episodes/:id/move', (req, res) => {
  const ep = episodeRow(req)
  const dir = req.body?.direction === 'up' ? -1 : req.body?.direction === 'down' ? 1 : 0
  if (!dir) throw new HttpError(400, 'direction must be "up" or "down"')
  const other = db.prepare('SELECT * FROM episodes WHERE series_id = ? AND number = ?').get(ep.series_id, ep.number + dir) as
    | EpisodeRow
    | undefined
  if (other) {
    transaction(() => {
      db.prepare('UPDATE episodes SET number = -1 WHERE id = ?').run(ep.id)
      db.prepare('UPDATE episodes SET number = ? WHERE id = ?').run(ep.number, other.id)
      db.prepare('UPDATE episodes SET number = ? WHERE id = ?').run(other.number, ep.id)
      touch(ep.series_id)
    })
  }
  res.json(seriesDetail(ep.series_id))
})

/** Deletes an episode and renumbers the ones after it. */
adminRouter.delete('/episodes/:id', (req, res) => {
  const ep = episodeRow(req)
  transaction(() => {
    db.prepare('DELETE FROM episodes WHERE id = ?').run(ep.id)
    // Two passes via negative numbers so the UNIQUE(series_id, number) constraint never collides.
    db.prepare('UPDATE episodes SET number = -(number - 1) WHERE series_id = ? AND number > ?').run(ep.series_id, ep.number)
    db.prepare('UPDATE episodes SET number = -number WHERE series_id = ? AND number < 0').run(ep.series_id)
    touch(ep.series_id)
  })
  removeLocalMedia(ep.video_url)
  res.json(seriesDetail(ep.series_id))
})

// ----- Users -----

function adminUser(id: number): AdminUser {
  const u = db.prepare('SELECT id, email, name, is_admin, created_at FROM users WHERE id = ?').get(id) as
    | { id: number; email: string; name: string; is_admin: number; created_at: number }
    | undefined
  if (!u) throw new HttpError(404, 'User not found')
  return { id: u.id, email: u.email, name: u.name, isAdmin: u.is_admin === 1, createdAt: u.created_at, subscription: getSubscription(u.id) }
}

adminRouter.get('/users', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const filter = req.query.filter
  const rows = db
    .prepare(
      `SELECT id FROM users WHERE (? = '' OR email LIKE ? OR name LIKE ?) ORDER BY created_at DESC LIMIT 200`,
    )
    .all(q, `%${q}%`, `%${q}%`) as { id: number }[]
  let users = rows.map((r) => adminUser(r.id))
  if (filter === 'subscribers') users = users.filter((u) => isActive(u.subscription))
  if (filter === 'admins') users = users.filter((u) => u.isAdmin)
  res.json(users)
})

adminRouter.patch('/users/:id', (req, res) => {
  const id = int(req.params.id, 'User', { min: 1 })
  const isAdmin = bool(req.body?.isAdmin, 'Admin')
  if (id === req.user!.id && !isAdmin) throw new HttpError(400, "You can't remove your own admin access")
  adminUser(id)
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id)
  res.json(adminUser(id))
})

/** Grants complimentary access. days = null means no end date. */
adminRouter.post('/users/:id/access', (req, res) => {
  const id = int(req.params.id, 'User', { min: 1 })
  adminUser(id)
  const plan = req.body?.plan ? getPlan(String(req.body.plan)) : MEMBERSHIP
  if (!plan) throw new HttpError(400, 'Unknown plan')
  const days = req.body?.days === null ? null : int(req.body?.days, 'Days', { min: 1, max: 3650 })
  const end = days === null ? null : Date.now() + days * DAY_MS
  db.prepare(
    `INSERT INTO subscriptions (user_id, plan, current_period_end, source, updated_at) VALUES (?, ?, ?, 'comp', ?)
     ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, current_period_end = excluded.current_period_end,
       source = 'comp', updated_at = excluded.updated_at`,
  ).run(id, plan.id, end, Date.now())
  res.json(adminUser(id))
})

adminRouter.delete('/users/:id/access', (req, res) => {
  const id = int(req.params.id, 'User', { min: 1 })
  db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(id)
  res.json(adminUser(id))
})

// ----- Orders -----

adminRouter.get('/orders', (req, res) => {
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null
  const rows = db
    .prepare(
      `SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id
       WHERE (? IS NULL OR o.status = ?) ORDER BY o.created_at DESC LIMIT 200`,
    )
    .all(status, status) as Record<string, unknown>[]
  res.json(
    rows.map((o) => ({
      id: o.id,
      email: o.email,
      plan: o.plan,
      months: o.months,
      amountCents: o.amount_cents,
      provider: o.provider,
      providerInvoiceId: o.provider_invoice_id,
      status: o.status,
      payCurrency: o.pay_currency,
      createdAt: o.created_at,
      paidAt: o.paid_at,
    })),
  )
})

/** Manually confirm an order, e.g. an underpaid invoice the customer topped up off-platform. */
adminRouter.post('/orders/:id/mark-paid', (req, res) => {
  const order = db.prepare('SELECT id, status FROM orders WHERE id = ?').get(req.params.id as string) as
    | { id: string; status: string }
    | undefined
  if (!order) throw new HttpError(404, 'Order not found')
  if (order.status === 'paid') throw new HttpError(400, 'Order is already paid')
  fulfillOrder(order.id)
  res.json({ ok: true })
})
