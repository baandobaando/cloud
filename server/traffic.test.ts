import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bingetube-traffic-'))
const { db } = await import('./db.ts')
const { buildTraffic } = await import('./traffic.ts')

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 4, 12)
const view = (visitor: string, p: string, t: number, extra: { referrer?: string; country?: string; device?: string } = {}) =>
  db.prepare('INSERT INTO page_views (visitor, path, referrer, country, device, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    visitor, p, extra.referrer ?? '', extra.country ?? '', extra.device ?? 'desktop', t,
  )

test('counts each visitor once per day, page views, sections, sources and live visitors', () => {
  db.prepare("INSERT INTO series (id, title, synopsis, genres, year, rating, palette, emoji, free_episodes, published, created_at, updated_at) VALUES ('s1', 'Show One', '', '[]', 2026, 'TV-14', '[]', '', 3, 1, 0, 0)").run()
  view('a', '/', now - 2 * DAY, { referrer: 'instagram.com', country: 'US', device: 'mobile' })
  view('a', '/title/s1', now - 2 * DAY + 1000)
  view('a', '/', now - DAY) // same hash on another day = another daily visitor
  view('b', '/watch/s1/1', now - 60_000, { country: 'AE' })
  view('old', '/', now - 40 * DAY) // previous period
  const t = buildTraffic('30d', now)
  assert.equal(t.kpis.pageviews.value, 4)
  assert.equal(t.kpis.visitors.value, 3)
  assert.equal(t.kpis.visitors.previous, 1)
  assert.equal(t.liveNow, 1)
  assert.equal(t.topSeries[0].label, 'Show One')
  assert.equal(t.topSeries[0].views, 2)
  assert.ok(t.referrers.some((r) => r.label === 'instagram.com'))
  assert.deepEqual(t.topPages.map((r) => r.label).sort(), ['Home', 'Player', 'Show pages'])
  assert.equal(t.kpis.visitors.series.reduce((a, b) => a + b, 0), 3)
})
