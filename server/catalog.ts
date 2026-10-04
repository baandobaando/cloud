import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { config } from './config.ts'
import { db } from './db.ts'
import { HttpError } from './http.ts'
import { SERIES_SELECT, isEntitled, toEpisodeView, toSummary, type EpisodeRow, type SeriesRow } from './models.ts'

export const catalogRouter = Router()

catalogRouter.get('/catalog', (_req, res) => {
  const rows = db
    .prepare(`${SERIES_SELECT} WHERE s.published = 1 ORDER BY s.created_at DESC`)
    .all() as unknown as SeriesRow[]
  res.json(rows.map(toSummary))
})

catalogRouter.get('/series/:id', (req, res) => {
  const row = db.prepare(`${SERIES_SELECT} WHERE s.id = ?`).get(req.params.id) as SeriesRow | undefined
  if (!row || (row.published !== 1 && !req.user?.isAdmin)) throw new HttpError(404, 'Series not found')
  const entitled = isEntitled(req.user)
  const episodes = db
    .prepare('SELECT * FROM episodes WHERE series_id = ? ORDER BY number')
    .all(row.id) as unknown as EpisodeRow[]
  res.json({
    ...toSummary(row),
    episodes: episodes.map((e) => toEpisodeView(e, entitled || e.number <= row.free_episodes)),
  })
})

// ----- Media -----

export const mediaDirs = {
  episodes: path.join(config.dataDir, 'uploads', 'episodes'),
  posters: path.join(config.dataDir, 'uploads', 'posters'),
}
for (const dir of Object.values(mediaDirs)) fs.mkdirSync(dir, { recursive: true })

const SAFE_NAME = /^[a-zA-Z0-9_-]+\.[a-z0-9]{2,5}$/

export const mediaRouter = Router()

mediaRouter.get('/posters/:file', (req, res) => {
  if (!SAFE_NAME.test(req.params.file)) throw new HttpError(404, 'Not found')
  res.sendFile(req.params.file, { root: mediaDirs.posters, maxAge: '7d' })
})

/** Uploaded episode videos are only served to viewers allowed to watch that episode. */
mediaRouter.get('/episodes/:file', (req, res) => {
  const file = req.params.file
  if (!SAFE_NAME.test(file)) throw new HttpError(404, 'Not found')
  const ep = db
    .prepare(
      `SELECT e.number, s.free_episodes, s.published FROM episodes e JOIN series s ON s.id = e.series_id
       WHERE e.video_url = ?`,
    )
    .get(`/media/episodes/${file}`) as { number: number; free_episodes: number; published: number } | undefined
  if (!ep) throw new HttpError(404, 'Not found')
  const allowed =
    req.user?.isAdmin || (ep.published === 1 && (ep.number <= ep.free_episodes || isEntitled(req.user)))
  if (!allowed) throw new HttpError(req.user ? 402 : 401, 'Subscribe to watch this episode')
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.sendFile(file, { root: mediaDirs.episodes })
})
