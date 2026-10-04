import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, test } from 'node:test'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bingetube-sync-'))
const { db } = await import('./db.ts')
const { syncEpisodes } = await import('./bunnyImport.ts')
const { planEpisodes } = await import('./bunny.ts')
type V = Parameters<typeof planEpisodes>[0][number]

const v = (title: string, length = 60): V => ({
  guid: crypto.randomUUID(),
  title,
  length,
  width: 1080,
  height: 1920,
  status: 4,
  dateUploaded: '2026-10-04T07:00:00',
  collectionId: 'c1',
  availableResolutions: '1080p',
})
const S = 'show'
const eps = () =>
  db.prepare('SELECT id, number, title, duration_sec AS d, video_url AS url FROM episodes WHERE series_id = ? ORDER BY number').all(S) as {
    id: number
    number: number
    title: string
    d: number
    url: string
  }[]

beforeEach(() => {
  db.exec('DELETE FROM episodes; DELETE FROM series; DELETE FROM bunny_removed_episodes')
  db.prepare(
    "INSERT INTO series (id, title, tagline, synopsis, genres, year, rating, palette, emoji, is_new, free_episodes, published, created_at, updated_at) VALUES (?, 'Show', '', '', '[]', 2026, 'TV-14', '[\"#000\",\"#000\"]', 'x', 0, 5, 1, 0, 0)",
  ).run(S)
})

test('keeps edited titles and ids, adds new videos, removes ones gone from Bunny', () => {
  const [a, b, c] = [v('ep1'), v('ep2'), v('ep3')]
  syncEpisodes(S, planEpisodes([a, b]).episodes)
  const first = eps()
  db.prepare("UPDATE episodes SET title = 'The Wedding' WHERE id = ?").run(first[0].id)

  assert.equal(syncEpisodes(S, planEpisodes([a, b]).episodes), false, 'nothing changed')
  assert.equal(syncEpisodes(S, planEpisodes([a, b, c]).episodes), true)
  let now = eps()
  assert.deepEqual(now.map((e) => e.number), [1, 2, 3])
  assert.equal(now[0].title, 'The Wedding')
  assert.equal(now[0].id, first[0].id)
  assert.equal(now[2].title, 'Episode 3')

  syncEpisodes(S, planEpisodes([a, c]).episodes) // ep2 deleted in Bunny
  now = eps()
  assert.deepEqual(now.map((e) => e.url.slice(6)), [a.guid, c.guid])
  assert.deepEqual(now.map((e) => e.number), [1, 2])
})

test('respects manual reordering and admin deletions', () => {
  const [a, b, c, d] = [v('ep1'), v('ep2'), v('ep3'), v('ep4')]
  syncEpisodes(S, planEpisodes([a, b, c]).episodes)
  // Admin swaps 1 and 2, and deletes 3.
  const [e1, e2, e3] = eps()
  db.prepare('UPDATE episodes SET number = -1 WHERE id = ?').run(e1.id)
  db.prepare('UPDATE episodes SET number = 1 WHERE id = ?').run(e2.id)
  db.prepare('UPDATE episodes SET number = 2 WHERE id = ?').run(e1.id)
  db.prepare('DELETE FROM episodes WHERE id = ?').run(e3.id)
  db.prepare('INSERT INTO bunny_removed_episodes VALUES (?, ?, 0)').run(S, e3.url)

  syncEpisodes(S, planEpisodes([a, b, c, d]).episodes)
  assert.deepEqual(eps().map((e) => e.url.slice(6)), [b.guid, a.guid, d.guid], 'order kept, deleted stays deleted, new appended')
})

test('updates durations from Bunny', () => {
  const a = v('ep1', 60)
  syncEpisodes(S, planEpisodes([a]).episodes)
  syncEpisodes(S, planEpisodes([{ ...a, length: 75 }]).episodes)
  assert.equal(eps()[0].d, 75)
})
