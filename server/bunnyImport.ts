// Bunny Stream → catalog import, used by the admin button and the automatic background sync.
import { BUNNY_PREFIX, bunnyConfigured, cleanTitle, guessGenres, listCollections, listVideos, paletteFor, planEpisodes } from './bunny.ts'
import { db, transaction } from './db.ts'

export interface ImportReportRow {
  collection: string
  seriesId: string
  action: 'created' | 'updated' | 'skipped'
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
    transaction(() => {
      if (!existing) {
        db.prepare(
          `INSERT INTO series (id, title, tagline, synopsis, genres, year, rating, palette, emoji, poster_url, is_new, trending_rank,
             free_episodes, published, created_at, updated_at, bunny_collection_id)
           VALUES (?, ?, '', '', ?, ?, 'TV-14', ?, '🎬', ?, 0, NULL, 5, ?, ?, ?, ?)`,
        ).run(seriesId, title, JSON.stringify(guessGenres(title)), new Date().getFullYear(), JSON.stringify(paletteFor(title)),
          `${BUNNY_PREFIX}${plan.episodes[0].video.guid}/thumbnail.jpg`, publishNew ? 1 : 0, now, now, col.guid)
      } else {
        db.prepare(
          `UPDATE series SET updated_at = ?, poster_url = COALESCE(poster_url, ?) WHERE id = ?`,
        ).run(now, `${BUNNY_PREFIX}${plan.episodes[0].video.guid}/thumbnail.jpg`, seriesId)
        db.prepare('DELETE FROM episodes WHERE series_id = ?').run(seriesId)
      }
      const insert = db.prepare('INSERT INTO episodes (series_id, number, title, duration_sec, video_url) VALUES (?, ?, ?, ?, ?)')
      for (const ep of plan.episodes) {
        insert.run(seriesId, ep.number, `Episode ${ep.number}`, Math.max(1, Math.round(ep.video.length)), `${BUNNY_PREFIX}${ep.video.guid}`)
      }
    })
    report.push({ collection: col.name, seriesId, action: existing ? 'updated' : 'created', episodes: plan.episodes.length, pending: plan.pending, missing: plan.missing })
  }

  return {
    created: report.filter((r) => r.action === 'created').length,
    updated: report.filter((r) => r.action === 'updated').length,
    skipped: report.filter((r) => r.action === 'skipped').length,
    episodes: report.reduce((n, r) => n + r.episodes, 0),
    pending: report.reduce((n, r) => n + r.pending, 0),
    report,
  }
}

let running: Promise<ImportResult> | null = null

/** Runs one import at a time; overlapping calls share the in-flight run. */
function importOnce(publishNew: boolean): Promise<ImportResult> {
  running ??= runBunnyImport({ publishNew }).finally(() => {
    running = null
  })
  return running
}

/**
 * Keeps the catalog in sync with Bunny without anyone pressing a button:
 * imports (and publishes) on startup, then checks for new episodes every 30 minutes.
 * Disable with BUNNY_AUTO_IMPORT=off.
 */
export function startBunnyAutoImport() {
  if (!bunnyConfigured() || process.env.BUNNY_AUTO_IMPORT === 'off') return
  // Once real shows are connected, the local sample shows only get in the way.
  db.prepare('UPDATE series SET published = 0 WHERE bunny_collection_id IS NULL AND id IN (SELECT DISTINCT series_id FROM episodes WHERE video_url LIKE ?)').run('/sample/%')
  const sync = () =>
    importOnce(true)
      .then((r) => console.log(`[bunny] Synced ${r.created + r.updated} series, ${r.episodes} episodes (${r.created} new, ${r.pending} still processing)`))
      .catch((err) => console.error('[bunny] Sync failed:', err.message))
  setTimeout(sync, 1000)
  setInterval(sync, 30 * 60 * 1000).unref()
}
