// Bunny Stream integration: library API client, signed playback URLs and catalog import.
import crypto from 'node:crypto'
import type { Genre } from '../shared/types.ts'
import { config } from './config.ts'

const API = 'https://video.bunnycdn.com'
/** Episodes store `bunny:<videoId>`; posters store `bunny:<videoId>/thumbnail.jpg`. */
export const BUNNY_PREFIX = 'bunny:'
const VIDEO_TTL_SEC = 6 * 3600
const POSTER_TTL_SEC = 24 * 3600

export function bunnyConfigured(): boolean {
  const b = config.bunny
  return Boolean(b.libraryId && b.libraryKey && b.cdnHost)
}

// ---------------------------------------------------------------- API client

export interface BunnyCollection {
  guid: string
  name: string
  videoCount: number
  totalSize: number
}

export interface BunnyVideo {
  guid: string
  title: string
  length: number
  width: number
  height: number
  /** 0 created, 1 uploaded, 2 processing, 3 transcoding, 4 finished, 5 error, 6 upload failed */
  status: number
  dateUploaded: string
  collectionId: string
  availableResolutions: string | null
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/library/${config.bunny.libraryId}${path}`, {
    headers: { AccessKey: config.bunny.libraryKey, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Bunny API ${path} failed: HTTP ${res.status}`)
  return (await res.json()) as T
}

async function paged<T>(path: string, perPage: number): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const d = await api<{ totalItems: number; items: T[] }>(`${path}${sep}page=${page}&itemsPerPage=${perPage}`)
    out.push(...d.items)
    if (page * perPage >= d.totalItems || d.items.length === 0) return out
  }
}

export const listCollections = () => paged<BunnyCollection>('/collections?orderBy=date', 100)
export const listVideos = (collectionId: string) =>
  paged<BunnyVideo>(`/videos?collection=${encodeURIComponent(collectionId)}&orderBy=date`, 1000)

// ---------------------------------------------------------------- signed URLs

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\n/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

interface SignOptions {
  path: string
  expires: number
  /** Directory token: grants access to every file under `tokenPath` (needed for HLS segments). */
  tokenPath?: string
  key: string
  mode: 'sha256' | 'hmac'
  host: string
}

/**
 * Bunny CDN token authentication (advanced). Directory tokens are embedded in the path
 * (`/bcdn_token=...&expires=.../<path>`) so relative HLS segment URLs inherit them.
 */
export function signCdnUrl({ path, expires, tokenPath, key, mode, host }: SignOptions): string {
  const params = new URLSearchParams()
  if (tokenPath) params.set('token_path', tokenPath)
  params.sort()
  let signingData = ''
  let urlParams = ''
  params.forEach((value, name) => {
    signingData += `${signingData ? '&' : ''}${name}=${value}`
    urlParams += `&${name}=${encodeURIComponent(value)}`
  })
  const signaturePath = tokenPath ?? path
  const token =
    mode === 'hmac'
      ? 'HS256-' + b64url(crypto.createHmac('sha256', key).update(signaturePath + expires + signingData).digest())
      : b64url(crypto.createHash('sha256').update(key + signaturePath + expires + signingData).digest())
  return tokenPath
    ? `https://${host}/bcdn_token=${token}${urlParams}&expires=${expires}${path}`
    : `https://${host}${path}?token=${token}${urlParams}&expires=${expires}`
}

/** Expiry rounded up to the hour so URLs stay identical (and cacheable) within that hour. */
function expiryIn(ttlSec: number): number {
  return Math.ceil((Date.now() / 1000 + ttlSec) / 3600) * 3600
}

/** Turns a stored `bunny:` reference into a playable/viewable URL; other URLs pass through. */
export function resolveMediaUrl(stored: string | null): string | null {
  if (!stored?.startsWith(BUNNY_PREFIX)) return stored
  const { cdnHost: host, tokenKey: key, tokenMode: mode } = config.bunny
  if (!host) return null
  const ref = stored.slice(BUNNY_PREFIX.length)
  const isFile = ref.includes('/')
  const videoId = isFile ? ref.split('/')[0] : ref
  const path = isFile ? `/${ref}` : `/${videoId}/playlist.m3u8`
  if (!key) return `https://${host}${path}`
  return isFile
    ? signCdnUrl({ path, expires: expiryIn(POSTER_TTL_SEC), key, mode, host })
    : signCdnUrl({ path, expires: expiryIn(VIDEO_TTL_SEC), tokenPath: `/${videoId}/`, key, mode, host })
}

// ---------------------------------------------------------------- import helpers

/** Pulls the episode number out of titles like "my-show ep12", "Episode 12" or "E12". */
export function parseEpisodeNumber(title: string): number | null {
  const m = /(?:^|[^a-z])(?:ep(?:isode)?|e)[\s._-]*0*(\d{1,4})(?!\d)/i.exec(title) ?? /(\d{1,4})\D*$/.exec(title)
  return m ? Number(m[1]) : null
}

const GENRE_HINTS: [Genre, RegExp][] = [
  ['Mafia', /\b(mafia|don|godfather|sicilian|mob|cartel)\b/i],
  ['Werewolf & Fantasy', /\b(wolf|wolves|alpha|luna|dragon|vampire|olympus|zeus|gods?|system|monster|panther|witch|magic|apocalypse|immortal|demon)\b/i],
  ['Billionaire Romance', /\b(billionaire|ceo|tycoon|richest|rich|empire|contract|marri(ed|age)|wife|husband|vows|love)\b/i],
  ['Revenge', /\b(revenge|payback|divorce|ex|betray(al|ed)?|regret(ted)?|reject|kneel|wrath|prison|left|reckoning|drained|threats?)\b/i],
  ['Hidden Identity', /\b(identity|secret|hidden|heir|queen|king|princess|prince|disguise|erasing|returns?)\b/i],
  ['Family Secrets', /\b(family|mother|daughter|son|sister|brothers?|orphanage|mom|kids?)\b/i],
]

/** Best-guess genres from a title (admins can change them afterwards). */
export function guessGenres(title: string): Genre[] {
  const found = GENRE_HINTS.filter(([, re]) => re.test(title)).map(([g]) => g)
  const picked = found.slice(0, 2)
  return picked.length ? picked : ['Revenge']
}

const PALETTES: [string, string][] = [
  ['#7a0f2e', '#1a0b2e'],
  ['#3b0a0a', '#c2410c'],
  ['#0f172a', '#4338ca'],
  ['#111111', '#7f1d1d'],
  ['#064e3b', '#0c4a6e'],
  ['#831843', '#3b0764'],
  ['#1e3a8a', '#b45309'],
  ['#450a0a', '#1c1917'],
  ['#18181b', '#a16207'],
  ['#4c1d95', '#be185d'],
]

export function paletteFor(title: string): [string, string] {
  const h = crypto.createHash('md5').update(title).digest()
  return PALETTES[h[0] % PALETTES.length]
}

/** Cleans up a collection name for display (trims stray whitespace and fixes ALL-CAPS titles). */
export function cleanTitle(name: string): string {
  const t = name.replace(/\s+/g, ' ').trim()
  const letters = t.replace(/[^a-z]/gi, '')
  const upper = letters.replace(/[^A-Z]/g, '').length
  if (letters.length > 8 && upper / letters.length > 0.8) {
    const small = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'me', 'my', 'down'])
    return t
      .toLowerCase()
      .split(' ')
      .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ')
  }
  return t
}

export interface ImportPlanEpisode {
  number: number
  sourceNumber: number | null
  video: BunnyVideo
}

/**
 * Orders a collection's finished videos into episodes: sorted by the number in the title,
 * one video per number (prefers the highest resolution, then the earliest upload),
 * renumbered 1..N so the app has no holes. Returns the missing source numbers too.
 */
export function planEpisodes(videos: BunnyVideo[]): { episodes: ImportPlanEpisode[]; missing: number[]; pending: number } {
  const finished = videos.filter((v) => v.status === 4)
  const pending = videos.filter((v) => v.status < 4).length
  const byNumber = new Map<string, BunnyVideo>()
  for (const v of finished) {
    const n = parseEpisodeNumber(v.title)
    const k = n === null ? `t:${v.guid}` : `n:${n}`
    const cur = byNumber.get(k)
    if (!cur || v.height > cur.height || (v.height === cur.height && v.dateUploaded < cur.dateUploaded)) byNumber.set(k, v)
  }
  const sorted = [...byNumber.values()].sort((a, b) => {
    const na = parseEpisodeNumber(a.title) ?? Infinity
    const nb = parseEpisodeNumber(b.title) ?? Infinity
    return na - nb || a.dateUploaded.localeCompare(b.dateUploaded)
  })
  const nums = sorted.map((v) => parseEpisodeNumber(v.title)).filter((n): n is number => n !== null)
  const missing: number[] = []
  if (nums.length) for (let i = 1; i < Math.max(...nums); i++) if (!nums.includes(i)) missing.push(i)
  return {
    episodes: sorted.map((video, i) => ({ number: i + 1, sourceNumber: parseEpisodeNumber(video.title), video })),
    missing,
    pending,
  }
}

