import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config, isProduction } from './config.ts'
import { SEED_SERIES } from './seed.ts'

fs.mkdirSync(config.dataDir, { recursive: true })

export const db = new DatabaseSync(path.join(config.dataDir, 'reelflix.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    synopsis TEXT NOT NULL DEFAULT '',
    genres TEXT NOT NULL DEFAULT '[]',
    year INTEGER NOT NULL,
    rating TEXT NOT NULL DEFAULT 'TV-14',
    palette TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '🎬',
    poster_url TEXT,
    is_new INTEGER NOT NULL DEFAULT 0,
    trending_rank INTEGER,
    free_episodes INTEGER NOT NULL DEFAULT 5,
    published INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    duration_sec INTEGER NOT NULL DEFAULT 90,
    video_url TEXT,
    UNIQUE (series_id, number)
  );

  CREATE TABLE IF NOT EXISTS my_list (
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE ON UPDATE CASCADE,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, series_id)
  );

  CREATE TABLE IF NOT EXISTS progress (
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE ON UPDATE CASCADE,
    episode_number INTEGER NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, series_id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    current_period_end INTEGER,
    source TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    months INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    provider TEXT NOT NULL,
    provider_invoice_id TEXT,
    checkout_url TEXT,
    status TEXT NOT NULL,
    pay_currency TEXT,
    created_at INTEGER NOT NULL,
    paid_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    plan TEXT,
    provider TEXT,
    order_id TEXT UNIQUE REFERENCES orders(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(series_id, number);
  CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_invoice ON orders(provider, provider_invoice_id);
`)

/** Adds a column to an existing table if an older database doesn't have it yet. */
function ensureColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

// Series imported from Bunny Stream remember their collection so re-imports update them.
ensureColumn('series', 'bunny_collection_id', 'TEXT')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_series_bunny ON series(bunny_collection_id) WHERE bunny_collection_id IS NOT NULL')
// Bunny collections an admin deleted from the site; the sync skips them until restored.
db.exec('CREATE TABLE IF NOT EXISTS bunny_hidden (collection_id TEXT PRIMARY KEY, title TEXT NOT NULL, hidden_at INTEGER NOT NULL)')

/** Runs fn inside a transaction, rolling back on error. */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** Sample series for local development only; a production database starts empty (import from Bunny). */
function seedCatalog() {
  if (isProduction && process.env.SEED_SAMPLE_CATALOG !== 'true') return
  // With a real Bunny library connected, start with just those shows.
  if (config.bunny.libraryId && config.bunny.libraryKey && process.env.SEED_SAMPLE_CATALOG !== 'true') return
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM series').get() as { n: number }
  if (n > 0) return

  const now = Date.now()
  const insertSeries = db.prepare(`
    INSERT INTO series (id, title, tagline, synopsis, genres, year, rating, palette, emoji, is_new, trending_rank,
      free_episodes, published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, 1, ?, ?)
  `)
  const insertEpisode = db.prepare(
    'INSERT INTO episodes (series_id, number, title, duration_sec, video_url) VALUES (?, ?, ?, ?, ?)',
  )

  transaction(() => {
    SEED_SERIES.forEach((s, i) => {
      const createdAt = now - i * 1000
      insertSeries.run(s.id, s.title, s.tagline, s.synopsis, JSON.stringify(s.genres), s.year, s.rating,
        JSON.stringify(s.palette), s.emoji, s.isNew ? 1 : 0, s.trendingRank ?? null, createdAt, createdAt)
      s.episodes.forEach((ep) => insertEpisode.run(s.id, ep.number, ep.title, ep.durationSec, ep.videoUrl))
    })
  })
  console.log(`[db] Seeded ${SEED_SERIES.length} series`)
}

seedCatalog()

// Older databases point sample episodes at Google's sample bucket, which now refuses requests.
db.exec(`
  UPDATE episodes SET video_url = '/sample/clip' || ((number - 1) % 5 + 1) || '.mp4'
  WHERE video_url LIKE 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/%'
`)
