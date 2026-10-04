import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { config, isProduction } from './config.ts'
import { db } from './db.ts'
import { HttpError, rateLimit, str } from './http.ts'

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>

const SESSION_COOKIE = 'rf_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const PROFILE_COLORS = ['#5f5a54', '#3f566e', '#4e6656', '#6a5068', '#7a6646', '#6e4a4a']

export interface AuthUser {
  id: number
  email: string
  name: string
  isAdmin: boolean
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length)
  return crypto.timingSafeEqual(expected, actual)
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export function createSession(res: Response, userId: number) {
  const token = crypto.randomBytes(32).toString('base64url')
  const now = Date.now()
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    now,
    now + SESSION_TTL_MS,
  )
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: SESSION_TTL_MS,
    path: '/',
  })
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

/** Attaches req.user when a valid session cookie is present. */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = readCookie(req, SESSION_COOKIE)
  if (token) {
    const row = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.is_admin, s.expires_at FROM sessions s
         JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      )
      .get(sha256(token)) as { id: number; email: string; name: string; is_admin: number; expires_at: number } | undefined
    if (row && row.expires_at > Date.now()) {
      req.user = { id: row.id, email: row.email, name: row.name, isAdmin: row.is_admin === 1 }
    }
  }
  next()
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in'))
  next()
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in'))
  if (!req.user.isAdmin) return next(new HttpError(403, 'Admins only'))
  next()
}

/**
 * CSRF defence: state-changing API calls must come from our own origin.
 * Combined with SameSite=Lax cookies this blocks cross-site form posts.
 */
export function sameOrigin(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.headers.origin
  if (!origin) return next()
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  const allowed = [config.appUrl, `http://${host}`, `https://${host}`]
  if (!allowed.includes(origin)) return next(new HttpError(403, 'Cross-origin request blocked'))
  next()
}

export function createUser(email: string, name: string, isAdmin: boolean, passwordHash: string) {
  const now = Date.now()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (email, password_hash, name, is_admin, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(email, passwordHash, name, isAdmin ? 1 : 0, now)
  const userId = Number(lastInsertRowid)
  db.prepare('INSERT INTO profiles (user_id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
    userId,
    name,
    PROFILE_COLORS[0],
    now,
  )
  return userId
}

export function nextProfileColor(userId: number): string {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?').get(userId) as { n: number }
  return PROFILE_COLORS[n % PROFILE_COLORS.length]
}

/** Creates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD if it doesn't exist yet. */
export async function ensureAdmin() {
  if (!config.adminEmail || !config.adminPassword) return
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(config.adminEmail) as { id: number } | undefined
  if (existing) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id)
    return
  }
  const hash = await hashPassword(config.adminPassword)
  createUser(config.adminEmail, 'Admin', true, hash)
  console.log(`[auth] Created admin account ${config.adminEmail}`)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const authRouter = Router()
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })

authRouter.post('/signup', authLimiter, async (req, res) => {
  const email = str(req.body?.email, 'Email', { min: 3, max: 254 }).toLowerCase()
  const password = str(req.body?.password, 'Password', { min: 8, max: 200 })
  const name = str(req.body?.name ?? email.split('@')[0], 'Name', { min: 1, max: 40 })
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address')
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'An account with that email already exists. Try signing in.')
  }
  const userId = createUser(email, name, false, await hashPassword(password))
  createSession(res, userId)
  res.status(201).json({ ok: true })
})

authRouter.post('/login', authLimiter, async (req, res) => {
  const email = str(req.body?.email, 'Email', { min: 1, max: 254 }).toLowerCase()
  const password = str(req.body?.password, 'Password', { min: 1, max: 200 })
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email) as
    | { id: number; password_hash: string }
    | undefined
  // Hash even when the user doesn't exist so response timing doesn't leak which emails are registered.
  const ok = user
    ? await verifyPassword(password, user.password_hash)
    : (await hashPassword(password), false)
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password')
  createSession(res, user.id)
  res.json({ ok: true })
})

authRouter.post('/logout', (req, res) => {
  const token = readCookie(req, SESSION_COOKIE)
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ ok: true })
})

authRouter.post('/password', requireUser, authLimiter, async (req, res) => {
  const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
  const next = str(req.body?.newPassword, 'New password', { min: 8, max: 200 })
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string }
  // Accounts created with Google/Apple have no password yet and may set one without the current one.
  const hasPassword = row.password_hash.startsWith('scrypt$')
  if (hasPassword && !(await verifyPassword(current, row.password_hash))) throw new HttpError(400, 'Current password is incorrect')
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), req.user!.id)
  // Sign out every other session.
  const token = readCookie(req, SESSION_COOKIE)
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user!.id, sha256(token ?? ''))
  res.json({ ok: true })
})

export function pruneExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
}
