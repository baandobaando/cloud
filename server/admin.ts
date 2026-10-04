import { buildAnalytics } from './analytics.ts'
import { logAdmin, registerPeopleRoutes } from './adminPeople.ts'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Router, type Request, type RequestHandler } from 'express'
import multer from 'multer'
import {
  DURATIONS,
  GENRES,
  MEMBERSHIP,
  RATINGS,
  getPlan,
  type AdminSeriesDetail,
  type AdminStats,
  type Genre,
  type Rating,
  type SeriesInput,
} from '../shared/types.ts'
import { requireAdmin } from './auth.ts'
import { config } from './config.ts'
import { BUNNY_PREFIX, bunnyConfigured, listCollections } from './bunny.ts'
import { getLastSync, importBunnyNow } from './bunnyImport.ts'
import { mediaDirs } from './catalog.ts'
import { db, transaction } from './db.ts'
import { HttpError, bool, int, str } from './http.ts'
import {
  SERIES_SELECT,
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
  const since = Date.now() - 30 * DAY_MS
  const views = db
    .prepare('SELECT episode_number AS n, COUNT(*) AS c FROM episode_views WHERE series_id = ? AND created_at > ? GROUP BY episode_number')
    .all(id, since) as { n: number; c: number }[]
  const viewers = (db.prepare('SELECT COUNT(DISTINCT profile_id) AS n FROM episode_views WHERE series_id = ? AND created_at > ?').get(id, since) as { n: number }).n
  return {
    ...toAdminSeries(row),
    episodes: eps.map(toAdminEpisode),
    source: row.bunny_collection_id ? 'bunny' : 'manual',
    runtimeSec: eps.reduce((n, e) => n + e.duration_sec, 0),
    views30d: views.reduce((n, v) => n + v.c, 0),
    viewers30d: viewers,
    episodeViews30d: Object.fromEntries(views.map((v) => [v.n, v.c])),
    removedFromBunny: (db.prepare('SELECT COUNT(*) AS n FROM bunny_removed_episodes WHERE series_id = ?').get(id) as { n: number }).n,
  }
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
  if (!/^https:\/\//i.test(url) && !url.startsWith('/media/episodes/') && !url.startsWith('/sample/') && !url.startsWith(BUNNY_PREFIX)) {
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
    .prepare('SELECT plan, source FROM subscriptions WHERE current_period_end IS NULL OR current_period_end > ?')
    .all(now) as { plan: string; source: string }[]
  // Only paying members count toward run-rate; complimentary and test access don't bring in money.
  const mrrCents = activeSubs.filter((s) => s.source === 'card' || s.source === 'crypto').reduce((sum, s) => sum + (getPlan(s.plan) ?? MEMBERSHIP).priceCents, 0)
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

adminRouter.get('/analytics', (req, res) => {
  res.json(buildAnalytics(String(req.query.range ?? '30d')))
})

// ----- Series -----

adminRouter.get('/series', (_req, res) => {
  const rows = db.prepare(`${SERIES_SELECT} ORDER BY s.updated_at DESC`).all() as unknown as SeriesRow[]
  // Per-series extras for the admin list: total runtime and watch activity over the last 30 days.
  const runtime = new Map(
    (db.prepare('SELECT series_id AS id, COALESCE(SUM(duration_sec), 0) AS n FROM episodes GROUP BY series_id').all() as { id: string; n: number }[]).map(
      (r) => [r.id, r.n],
    ),
  )
  const views = new Map(
    (
      db
        .prepare('SELECT series_id AS id, COUNT(*) AS views, COUNT(DISTINCT profile_id) AS viewers FROM episode_views WHERE created_at > ? GROUP BY series_id')
        .all(Date.now() - 30 * DAY_MS) as { id: string; views: number; viewers: number }[]
    ).map((r) => [r.id, r]),
  )
  res.json(
    rows.map((r) => ({
      ...toAdminSeries(r),
      runtimeSec: runtime.get(r.id) ?? 0,
      views30d: views.get(r.id)?.views ?? 0,
      viewers30d: views.get(r.id)?.viewers ?? 0,
      source: r.bunny_collection_id ? 'bunny' : 'manual',
    })),
  )
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

/**
 * Removes a series from the site. Uploaded files are deleted; Bunny videos stay in Bunny,
 * and the collection is remembered so the automatic sync doesn't bring the series back.
 */
function deleteSeries(row: SeriesRow) {
  const videos = db.prepare('SELECT video_url FROM episodes WHERE series_id = ?').all(row.id) as { video_url: string | null }[]
  transaction(() => {
    if (row.bunny_collection_id) {
      db.prepare('INSERT OR REPLACE INTO bunny_hidden (collection_id, title, hidden_at) VALUES (?, ?, ?)').run(
        row.bunny_collection_id,
        row.title,
        Date.now(),
      )
    }
    db.prepare('DELETE FROM series WHERE id = ?').run(row.id)
  })
  videos.forEach((v) => removeLocalMedia(v.video_url))
  removeLocalMedia(row.poster_url)
}

adminRouter.delete('/series/:id', (req, res) => {
  const row = seriesRow(req.params.id as string)
  deleteSeries(row)
  logAdmin(req, 'Deleted series', `series:${row.id}`, `${row.title} · ${row.episode_count} episodes`)
  res.json({ ok: true })
})

adminRouter.post('/series/bulk-delete', (req, res) => {
  const ids = req.body?.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((id) => typeof id === 'string')) {
    throw new HttpError(400, 'Choose at least one series')
  }
  let deleted = 0
  for (const id of ids as string[]) {
    const row = db.prepare(`${SERIES_SELECT} WHERE s.id = ?`).get(id) as SeriesRow | undefined
    if (!row) continue
    deleteSeries(row)
    logAdmin(req, 'Deleted series', `series:${row.id}`, `${row.title} · ${row.episode_count} episodes`)
    deleted++
  }
  res.json({ deleted })
})

// Check the target exists before multer writes a (possibly huge) file to disk.
const seriesMustExist: RequestHandler = (req, _res, next) => {
  seriesRow(req.params.id as string)
  next()
}
const episodeMustExist: RequestHandler = (req, _res, next) => {
  episodeRow(req)
  next()
}

adminRouter.post('/series/:id/poster', seriesMustExist, posterUpload, (req, res) => {
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
  // Editing a title sends back the signed Bunny URL; keep the stored reference unless it really changed.
  const sentUrl = req.body?.videoUrl ?? null
  const sameBunnyVideo =
    ep.video_url?.startsWith(BUNNY_PREFIX) && typeof sentUrl === 'string' && sentUrl.includes(`/${ep.video_url.slice(BUNNY_PREFIX.length)}/`)
  const videoUrl = sameBunnyVideo ? ep.video_url : validateVideoUrl(sentUrl)
  db.prepare('UPDATE episodes SET title = ?, duration_sec = ?, video_url = ? WHERE id = ?').run(title, durationSec, videoUrl, ep.id)
  if (ep.video_url !== videoUrl) removeLocalMedia(ep.video_url)
  touch(ep.series_id)
  res.json(seriesDetail(ep.series_id))
})

adminRouter.post('/episodes/:id/video', episodeMustExist, videoUpload, (req, res) => {
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
    // Remember deleted Bunny videos so the next sync doesn't bring them back.
    if (ep.video_url?.startsWith('bunny:')) {
      db.prepare('INSERT OR IGNORE INTO bunny_removed_episodes (series_id, video_url, removed_at) VALUES (?, ?, ?)').run(ep.series_id, ep.video_url, Date.now())
    }
    // Two passes via negative numbers so the UNIQUE(series_id, number) constraint never collides.
    db.prepare('UPDATE episodes SET number = -(number - 1) WHERE series_id = ? AND number > ?').run(ep.series_id, ep.number)
    db.prepare('UPDATE episodes SET number = -number WHERE series_id = ? AND number < 0').run(ep.series_id)
    touch(ep.series_id)
  })
  removeLocalMedia(ep.video_url)
  res.json(seriesDetail(ep.series_id))
})

// ----- Users, orders and activity log live in adminPeople.ts -----
registerPeopleRoutes(adminRouter)

// ----- Bunny Stream import -----

adminRouter.get('/bunny/status', async (_req, res) => {
  if (!bunnyConfigured()) {
    res.json({ configured: false })
    return
  }
  const collections = await listCollections()
  const linked = (db.prepare('SELECT COUNT(*) AS n FROM series WHERE bunny_collection_id IS NOT NULL').get() as { n: number }).n
  res.json({
    configured: true,
    collections: collections.length,
    videos: collections.reduce((n, c) => n + c.videoCount, 0),
    storageGb: Math.round(collections.reduce((n, c) => n + (c.totalSize ?? 0), 0) / 1e9),
    linkedSeries: linked,
    hiddenSeries: (db.prepare('SELECT COUNT(*) AS n FROM bunny_hidden').get() as { n: number }).n,
    autoSync: process.env.BUNNY_AUTO_IMPORT !== 'off',
    syncMinutes: config.bunny.syncMinutes,
    lastSync: getLastSync(),
  })
})

/** Brings back every series that was deleted from the site, then re-imports. */
adminRouter.post('/bunny/restore', async (_req, res) => {
  if (!bunnyConfigured()) throw new HttpError(400, 'Bunny Stream is not configured on the server')
  db.prepare('DELETE FROM bunny_hidden').run()
  res.json(await importBunnyNow(true))
})

adminRouter.post('/bunny/import', async (req, res) => {
  if (!bunnyConfigured()) throw new HttpError(400, 'Bunny Stream is not configured on the server')
  res.json(await importBunnyNow(req.body?.publish === true))
})
