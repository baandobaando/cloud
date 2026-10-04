// Bunny Stream → catalog import, used by the admin button and the automatic background sync.
import { config } from './config.ts'
import { BUNNY_PREFIX, bunnyConfigured, cleanTitle, guessGenres, keepHighestResolution, listCollections, listVideos, paletteFor, planEpisodes } from './bunny.ts'
import { db, transaction } from './db.ts'

export interface ImportReportRow {
  collection: string
  seriesId: string
  action: 'created' | 'updated' | 'unchanged' | 'skipped'
  episodes: number
  pending: number
  missing: number[]
  note?: string
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  episodes: number
  pending: number
  /** Videos trimmed to their highest resolution during this run. */
  trimmed: number
  report: ImportReportRow[]
}

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

/**
 * Creates or refreshes one series per Bunny collection. Only finished videos are imported;
 * re-running picks up episodes that finished processing since the last import.
 */
type PlannedEpisode = ReturnType<typeof planEpisodes>['episodes'][number]

/**
 * Brings an existing Bunny series' episodes in line with Bunny without throwing away admin edits:
 * titles, ids and any manual ordering are kept, new videos are added, videos gone from Bunny are removed,
 * and videos an admin deleted stay deleted. Returns whether anything changed.
 */
export function syncEpisodes(seriesId: string, planned: PlannedEpisode[]): boolean {
  const rows = db.prepare('SELECT id, number, duration_sec, video_url FROM episodes WHERE series_id = ? ORDER BY number').all(seriesId) as {
    id: number
    number: number
    duration_sec: number
    video_url: string
  }[]
  const removed = new Set(
    (db.prepare('SELECT video_url FROM bunny_removed_episodes WHERE series_id = ?').all(seriesId) as { video_url: string }[]).map((r) => r.video_url),
  )
  const wanted = planned
    .map((ep) => ({ url: `${BUNNY_PREFIX}${ep.video.guid}`, duration: Math.max(1, Math.round(ep.video.length)) }))
    .filter((ep) => !removed.has(ep.url))
  const wantedUrls = new Set(wanted.map((w) => w.url))
  const byUrl = new Map(rows.map((r) => [r.video_url, r]))
  let changed = false

  // Videos deleted in Bunny can't play any more.
  for (const r of rows) {
    if (!wantedUrls.has(r.video_url)) {
      db.prepare('DELETE FROM episodes WHERE id = ?').run(r.id)
      changed = true
    }
  }
  // Fill in real durations (episodes created by hand default to 90s).
  for (const w of wanted) {
    const r = byUrl.get(w.url)
    if (r && r.duration_sec !== w.duration) {
      db.prepare('UPDATE episodes SET duration_sec = ? WHERE id = ?').run(w.duration, r.id)
      changed = true
    }
  }

  const kept = rows.filter((r) => wantedUrls.has(r.video_url))
  const keptInPlanOrder = wanted.filter((w) => byUrl.has(w.url)).map((w) => w.url)
  // If the admin never reordered, follow Bunny's order (so new middle episodes slot in); otherwise append new ones.
  const manuallyOrdered = kept.some((r, i) => r.video_url !== keptInPlanOrder[i])
  const finalOrder = manuallyOrdered ? [...kept.map((r) => r.video_url), ...wanted.filter((w) => !byUrl.has(w.url)).map((w) => w.url)] : wanted.map((w) => w.url)

  const insert = db.prepare('INSERT INTO episodes (series_id, number, title, duration_sec, video_url) VALUES (?, ?, ?, ?, ?)')
  const added = wanted.filter((w) => !byUrl.has(w.url))
  // Park existing rows on negative numbers so renumbering never trips UNIQUE(series_id, number).
  const needsRenumber = added.length > 0 || kept.length !== rows.length || kept.some((r) => r.number !== finalOrder.indexOf(r.video_url) + 1)
  if (needsRenumber) {
    db.prepare('UPDATE episodes SET number = -id WHERE series_id = ?').run(seriesId)
    for (const w of added) insert.run(seriesId, -1_000_000 - finalOrder.indexOf(w.url), 'Episode', w.duration, w.url)
    finalOrder.forEach((url, i) => {
      db.prepare('UPDATE episodes SET number = ? WHERE series_id = ? AND video_url = ?').run(i + 1, seriesId, url)
    })
    // New episodes get a title matching their final number.
    for (const w of added) {
      const n = finalOrder.indexOf(w.url) + 1
      db.prepare('UPDATE episodes SET title = ? WHERE series_id = ? AND video_url = ?').run(`Episode ${n}`, seriesId, w.url)
    }
    changed = true
  }
  return changed
}

export async function runBunnyImport({ publishNew }: { publishNew: boolean }): Promise<ImportResult> {
  const collections = await listCollections()
  const report: ImportReportRow[] = []

  const hidden = new Set((db.prepare('SELECT collection_id FROM bunny_hidden').all() as { collection_id: string }[]).map((r) => r.collection_id))
  const wanted = collections.filter((c) => !hidden.has(c.guid))
  // Fetch episode lists six collections at a time; large libraries otherwise take minutes.
  const videosByCollection = new Map<string, Awaited<ReturnType<typeof listVideos>>>()
  const queue = [...wanted]
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) videosByCollection.set(c.guid, await listVideos(c.guid))
    }),
  )
  for (const col of wanted) {
    const videos = videosByCollection.get(col.guid) ?? []
    const plan = planEpisodes(videos)
    const title = cleanTitle(col.name)
    const existing = db.prepare('SELECT id FROM series WHERE bunny_collection_id = ?').get(col.guid) as { id: string } | undefined

    if (plan.episodes.length === 0) {
      report.push({ collection: col.name, seriesId: existing?.id ?? '', action: 'skipped', episodes: 0, pending: plan.pending, missing: [], note: 'No finished videos yet' })
      continue
    }
    if (existing) {
      const foreign = db
        .prepare("SELECT COUNT(*) AS n FROM episodes WHERE series_id = ? AND (video_url IS NULL OR video_url NOT LIKE 'bunny:%')")
        .get(existing.id) as { n: number }
      if (foreign.n > 0) {
        report.push({ collection: col.name, seriesId: existing.id, action: 'skipped', episodes: 0, pending: plan.pending, missing: plan.missing, note: 'Series has episodes added by hand; left unchanged' })
        continue
      }
    }

    const seriesId = existing?.id ?? slugify(title)
    const now = Date.now()
    let changed = false
    transaction(() => {
      if (!existing) {
        db.prepare(
          `INSERT INTO series (id, title, tagline, synopsis, genres, year, rating, palette, emoji, poster_url, is_new, trending_rank,
             free_episodes, published, created_at, updated_at, bunny_collection_id)
           VALUES (?, ?, '', '', ?, ?, 'TV-14', ?, '🎬', ?, 0, NULL, 5, ?, ?, ?, ?)`,
        ).run(seriesId, title, JSON.stringify(guessGenres(title)), new Date().getFullYear(), JSON.stringify(paletteFor(title)),
          `${BUNNY_PREFIX}${plan.episodes[0].video.guid}/thumbnail.jpg`, publishNew ? 1 : 0, now, now, col.guid)
        const insert = db.prepare('INSERT INTO episodes (series_id, number, title, duration_sec, video_url) VALUES (?, ?, ?, ?, ?)')
        for (const ep of plan.episodes) {
          insert.run(seriesId, ep.number, `Episode ${ep.number}`, Math.max(1, Math.round(ep.video.length)), `${BUNNY_PREFIX}${ep.video.guid}`)
        }
      } else {
        changed = syncEpisodes(seriesId, plan.episodes)
        db.prepare('UPDATE series SET poster_url = COALESCE(poster_url, ?) WHERE id = ?').run(`${BUNNY_PREFIX}${plan.episodes[0].video.guid}/thumbnail.jpg`, seriesId)
        if (changed) db.prepare('UPDATE series SET updated_at = ? WHERE id = ?').run(now, seriesId)
      }
    })
    const action = !existing ? 'created' : changed ? 'updated' : 'unchanged'
    report.push({ collection: col.name, seriesId, action, episodes: plan.episodes.length, pending: plan.pending, missing: plan.missing })
  }

  const trimmed = config.bunny.keepHighestOnly ? await keepHighestResolution([...videosByCollection.values()].flat()) : 0

  return {
    trimmed,
    created: report.filter((r) => r.action === 'created').length,
    updated: report.filter((r) => r.action === 'updated').length,
    skipped: report.filter((r) => r.action === 'skipped').length,
    episodes: report.reduce((n, r) => n + r.episodes, 0),
    pending: report.reduce((n, r) => n + r.pending, 0),
    report,
  }
}

let running: Promise<ImportResult> | null = null

export interface SyncSummary {
  at: number
  ok: boolean
  created: number
  updated: number
  episodes: number
  pending: number
  error?: string
}
let lastSync: SyncSummary | null = null
/** When the last Bunny sync finished and what it found (shown on the admin Series page). */
export const getLastSync = () => lastSync

/** Runs one import at a time; overlapping calls share the in-flight run. */
function importOnce(publishNew: boolean): Promise<ImportResult> {
  running ??= runBunnyImport({ publishNew })
    .then(
      (r) => {
        lastSync = { at: Date.now(), ok: true, created: r.created, updated: r.updated, episodes: r.episodes, pending: r.pending }
        return r
      },
      (err: Error) => {
        lastSync = { at: Date.now(), ok: false, created: 0, updated: 0, episodes: 0, pending: 0, error: err.message }
        throw err
      },
    )
    .finally(() => {
      running = null
    })
  return running
}

export const importBunnyNow = (publishNew = true) => importOnce(publishNew)

/**
 * Keeps the catalog in sync with Bunny without anyone pressing a button:
 * imports (and publishes) on startup, then checks for new episodes every BUNNY_SYNC_MINUTES
 * (default 5). Disable with BUNNY_AUTO_IMPORT=off.
 */
export function startBunnyAutoImport() {
  if (!bunnyConfigured() || process.env.BUNNY_AUTO_IMPORT === 'off') return
  // Once real shows are connected, the local sample shows only get in the way.
  db.prepare('UPDATE series SET published = 0 WHERE bunny_collection_id IS NULL AND id IN (SELECT DISTINCT series_id FROM episodes WHERE video_url LIKE ?)').run('/sample/%')
  const sync = () =>
    importOnce(true)
      .then((r) => console.log(`[bunny] Synced ${r.created + r.updated} series, ${r.episodes} episodes (${r.created} new, ${r.pending} still processing, ${r.trimmed} trimmed to top quality)`))
      .catch((err) => console.error('[bunny] Sync failed:', err.message))
  setTimeout(sync, 1000)
  setInterval(sync, config.bunny.syncMinutes * 60 * 1000).unref()
  console.log(`[bunny] Auto-sync every ${config.bunny.syncMinutes} minute${config.bunny.syncMinutes === 1 ? '' : 's'}`)
}
