import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bingetube-catalog-'))
const { db } = await import('./db.ts')
const { publicCatalog } = await import('./catalog.ts')

function addSeries(id: string, episodes: number) {
  db.prepare(
    `INSERT INTO series (id, title, tagline, synopsis, genres, year, rating, palette, emoji, published, free_episodes, created_at, updated_at)
     VALUES (?, ?, '', '', '[]', 2026, 'TV-14', '["#000000","#111111"]', '🎬', 1, 5, ?, ?)`,
  ).run(id, id, Date.now(), Date.now())
  for (let n = 1; n <= episodes; n++) db.prepare('INSERT INTO episodes (series_id, number, title, duration_sec) VALUES (?, ?, ?, 60)').run(id, n, `Ep ${n}`)
}

test('series still being uploaded (under 5 episodes) stay out of the catalog until the rest arrive', () => {
  addSeries('cat-full', 12)
  addSeries('cat-partial', 2)
  const ids = () => publicCatalog().map((s) => s.id)
  assert.ok(ids().includes('cat-full'))
  assert.ok(!ids().includes('cat-partial'))
  for (let n = 3; n <= 5; n++) db.prepare('INSERT INTO episodes (series_id, number, title, duration_sec) VALUES (?, ?, ?, 60)').run('cat-partial', n, `Ep ${n}`)
  assert.ok(ids().includes('cat-partial'))
})
