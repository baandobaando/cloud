import { Router, type Request } from 'express'
import type { Me, ProfileState, WatchProgress } from '../shared/types.ts'
import { nextProfileColor, requireUser } from './auth.ts'
import { trialEligible } from './subscriptions.ts'
import { db } from './db.ts'
import { HttpError, int, str } from './http.ts'
import { getSubscription, isEntitled } from './models.ts'

export const accountRouter = Router()

/** One profile per account. */
const MAX_PROFILES = 1

/** What /me returns for a signed-in user (also baked into the page HTML so the app can render straight away). */
export function buildMe(user: NonNullable<Request['user']>): Me {
  // Every account gets its one profile (older accounts may predate it).
  if (!db.prepare('SELECT 1 FROM profiles WHERE user_id = ?').get(user.id)) {
    db.prepare('INSERT INTO profiles (user_id, name, color, created_at) VALUES (?, ?, ?, ?)').run(user.id, user.name || 'Me', nextProfileColor(user.id), Date.now())
  }
  const profiles = db
    .prepare('SELECT id, name, color FROM profiles WHERE user_id = ? ORDER BY id')
    .all(user.id) as unknown as Me['profiles']
  return {
    ...user,
    subscription: getSubscription(user.id),
    isEntitled: isEntitled(user),
    profiles,
    hasPassword: (db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string }).password_hash.startsWith('scrypt$'),
    trialEligible: trialEligible(user.id),
  }
}

accountRouter.get('/me', (req, res) => {
  res.json(req.user ? buildMe(req.user) : null)
})

accountRouter.use('/profiles', requireUser)

/** Loads a profile id from the URL and verifies it belongs to the signed-in user. */
function ownedProfile(req: Request): number {
  const id = int(req.params.profileId, 'Profile', { min: 1 })
  const row = db.prepare('SELECT id FROM profiles WHERE id = ? AND user_id = ?').get(id, req.user!.id)
  if (!row) throw new HttpError(404, 'Profile not found')
  return id
}

function seriesExists(id: string): string {
  if (!db.prepare('SELECT 1 FROM series WHERE id = ?').get(id)) throw new HttpError(404, 'Series not found')
  return id
}

accountRouter.post('/profiles', (req, res) => {
  const name = str(req.body?.name, 'Name', { min: 1, max: 16 })
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?').get(req.user!.id) as { n: number }
  if (n >= MAX_PROFILES) throw new HttpError(400, 'Each account has one profile')
  const color = nextProfileColor(req.user!.id)
  const { lastInsertRowid } = db
    .prepare('INSERT INTO profiles (user_id, name, color, created_at) VALUES (?, ?, ?, ?)')
    .run(req.user!.id, name, color, Date.now())
  res.status(201).json({ id: Number(lastInsertRowid), name, color })
})

accountRouter.patch('/profiles/:profileId', (req, res) => {
  const id = ownedProfile(req)
  const name = str(req.body?.name, 'Name', { min: 1, max: 16 })
  db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(name, id)
  res.json({ ok: true })
})

accountRouter.delete('/profiles/:profileId', (req, res) => {
  const id = ownedProfile(req)
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?').get(req.user!.id) as { n: number }
  if (n <= 1) throw new HttpError(400, 'You need at least one profile')
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
  res.json({ ok: true })
})

accountRouter.get('/profiles/:profileId/state', (req, res) => {
  const id = ownedProfile(req)
  const list = db
    .prepare('SELECT series_id FROM my_list WHERE profile_id = ? ORDER BY added_at DESC')
    .all(id) as { series_id: string }[]
  const progressRows = db
    .prepare('SELECT series_id, episode_number, position, updated_at FROM progress WHERE profile_id = ?')
    .all(id) as { series_id: string; episode_number: number; position: number; updated_at: number }[]
  const progress: Record<string, WatchProgress> = {}
  for (const p of progressRows) {
    progress[p.series_id] = { episodeNumber: p.episode_number, position: p.position, updatedAt: p.updated_at }
  }
  const state: ProfileState = { myList: list.map((r) => r.series_id), progress }
  res.json(state)
})

accountRouter.put('/profiles/:profileId/list/:seriesId', (req, res) => {
  const id = ownedProfile(req)
  const seriesId = seriesExists(req.params.seriesId as string)
  db.prepare('INSERT OR IGNORE INTO my_list (profile_id, series_id, added_at) VALUES (?, ?, ?)').run(id, seriesId, Date.now())
  res.json({ ok: true })
})

accountRouter.delete('/profiles/:profileId/list/:seriesId', (req, res) => {
  const id = ownedProfile(req)
  db.prepare('DELETE FROM my_list WHERE profile_id = ? AND series_id = ?').run(id, req.params.seriesId as string)
  res.json({ ok: true })
})

accountRouter.put('/profiles/:profileId/progress/:seriesId', (req, res) => {
  const id = ownedProfile(req)
  const seriesId = seriesExists(req.params.seriesId as string)
  const episodeNumber = int(req.body?.episodeNumber, 'Episode', { min: 1, max: 10_000 })
  const position = Number(req.body?.position ?? 0)
  if (!Number.isFinite(position) || position < 0) throw new HttpError(400, 'Invalid position')
  db.prepare(
    `INSERT INTO progress (profile_id, series_id, episode_number, position, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (profile_id, series_id) DO UPDATE SET
       episode_number = excluded.episode_number, position = excluded.position, updated_at = excluded.updated_at`,
  ).run(id, seriesId, episodeNumber, position, Date.now())
  const now = Date.now()
  db.prepare('INSERT OR IGNORE INTO episode_views (profile_id, series_id, episode_number, day, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    seriesId,
    episodeNumber,
    Math.floor(now / 86_400_000),
    now,
  )
  res.json({ ok: true })
})
