import crypto from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { config, isProduction } from './config.ts'
import { db } from './db.ts'
import { createSession, createUser, readCookie } from './auth.ts'
import { rateLimit } from './http.ts'

/**
 * "Continue with Google / Apple" (OpenID Connect, authorization code flow with PKCE).
 * Each provider is only offered once its keys are set; see .env.example.
 */

type Provider = 'google' | 'apple'
const STATE_COOKIE = 'rf_oauth'
const STATE_TTL_MS = 10 * 60 * 1000
// Users created through Google/Apple have no password; this never matches a scrypt hash.
const NO_PASSWORD = '!oauth'

export function enabledProviders(): Record<Provider, boolean> {
  const { google, apple } = config
  return {
    google: Boolean(google.clientId && google.clientSecret),
    apple: Boolean(apple.clientId && apple.teamId && apple.keyId && apple.privateKey),
  }
}

const redirectUri = (p: Provider) => `${config.appUrl}/api/auth/oauth/${p}/callback`
const b64url = (buf: Buffer) => buf.toString('base64url')
const random = () => b64url(crypto.randomBytes(24))

interface PendingLogin {
  p: Provider
  state: string
  nonce: string
  verifier: string
  next: string
  exp: number
}

/** Only same-site paths; "//x" and "/\\x" are treated as other hosts by browsers. */
function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) && !next.includes('\\') ? next : '/'
}

/** Apple posts the callback cross-site, so its state cookie must be SameSite=None (which requires HTTPS). */
function stateCookieOptions(p: Provider) {
  return {
    httpOnly: true,
    secure: isProduction || p === 'apple',
    sameSite: p === 'apple' ? ('none' as const) : ('lax' as const),
    maxAge: STATE_TTL_MS,
    path: '/api/auth/oauth',
  }
}

/** Apple's client secret is a short-lived ES256 JWT signed with the .p8 key. */
function appleClientSecret(): string {
  const { teamId, keyId, clientId, privateKey } = config.apple
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })))
  const payload = b64url(
    Buffer.from(JSON.stringify({ iss: teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: clientId })),
  )
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  return `${header}.${payload}.${b64url(sig)}`
}

interface IdClaims {
  iss: string
  aud: string | string[]
  sub: string
  exp: number
  nonce?: string
  email?: string
  email_verified?: boolean | string
  name?: string
}

/**
 * The ID token comes straight from the provider's token endpoint over TLS in exchange for our client secret,
 * which OpenID Connect allows trusting without re-checking the signature. We still check who issued it,
 * who it's for, expiry and the nonce bound to this browser.
 */
function readIdToken(idToken: string, p: Provider, nonce: string): IdClaims {
  const claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as IdClaims
  const issuers = p === 'google' ? ['https://accounts.google.com', 'accounts.google.com'] : ['https://appleid.apple.com']
  const audience = p === 'google' ? config.google.clientId : config.apple.clientId
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!issuers.includes(claims.iss)) throw new Error('Unexpected issuer')
  if (!aud.includes(audience)) throw new Error('Token is for another app')
  if (claims.exp * 1000 < Date.now()) throw new Error('Token expired')
  if (claims.nonce !== nonce) throw new Error('Nonce mismatch')
  if (!claims.sub) throw new Error('Missing subject')
  return claims
}

async function exchangeCode(p: Provider, code: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(p),
    ...(p === 'google' ? { code_verifier: verifier } : {}),
    client_id: p === 'google' ? config.google.clientId : config.apple.clientId,
    client_secret: p === 'google' ? config.google.clientSecret : appleClientSecret(),
  })
  const url = p === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://appleid.apple.com/auth/token'
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string }
  if (!res.ok || !json.id_token) throw new Error(`Token exchange failed: ${json.error ?? res.status}`)
  return json.id_token
}

/** Finds the user for this Google/Apple account, linking by verified email or creating a new account. */
function findOrCreateUser(p: Provider, claims: IdClaims, fallbackName: string): number {
  const linked = db.prepare('SELECT user_id FROM user_identities WHERE provider = ? AND subject = ?').get(p, claims.sub) as
    | { user_id: number }
    | undefined
  if (linked) return linked.user_id

  const email = claims.email?.toLowerCase()
  const verified = claims.email_verified === true || claims.email_verified === 'true'
  if (!email || !verified) throw new Error('Your account did not share a verified email address')

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined
  const name = (claims.name || fallbackName || email.split('@')[0]).slice(0, 40)
  const userId = existing?.id ?? createUser(email, name, false, NO_PASSWORD)
  db.prepare('INSERT INTO user_identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)').run(
    p,
    claims.sub,
    userId,
    email,
    Date.now(),
  )
  return userId
}

export const oauthRouter = Router()
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 })

oauthRouter.get('/providers', (_req, res) => {
  res.json(enabledProviders())
})

oauthRouter.get('/oauth/:provider/start', limiter, (req, res) => {
  const p = req.params.provider as Provider
  if (!enabledProviders()[p]) return res.redirect('/login?error=unavailable')
  const pending: PendingLogin = { p, state: random(), nonce: random(), verifier: random() + random(), next: safeNext(req.query.next), exp: Date.now() + STATE_TTL_MS }
  res.cookie(STATE_COOKIE, b64url(Buffer.from(JSON.stringify(pending))), stateCookieOptions(p))
  const challenge = b64url(crypto.createHash('sha256').update(pending.verifier).digest())
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: p === 'google' ? config.google.clientId : config.apple.clientId,
    redirect_uri: redirectUri(p),
    scope: p === 'google' ? 'openid email profile' : 'name email',
    state: pending.state,
    nonce: pending.nonce,
  })
  // PKCE for Google; Apple doesn't document it and relies on the signed client secret instead.
  if (p === 'google') {
    params.set('code_challenge', challenge)
    params.set('code_challenge_method', 'S256')
    params.set('prompt', 'select_account')
  }
  // Apple only sends name/email to a form_post callback.
  if (p === 'apple') params.set('response_mode', 'form_post')
  const base = p === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://appleid.apple.com/auth/authorize'
  res.redirect(`${base}?${params}`)
})

async function finish(p: Provider, req: Request, res: Response, input: Record<string, unknown>) {
  const raw = readCookie(req, STATE_COOKIE)
  res.clearCookie(STATE_COOKIE, { path: '/api/auth/oauth' })
  let pending: PendingLogin | null = null
  try {
    pending = raw ? (JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as PendingLogin) : null
  } catch {
    pending = null
  }
  const fail = (code: string) => res.redirect(`/login?error=${code}${pending ? `&next=${encodeURIComponent(pending.next)}` : ''}`)

  if (input.error) return fail('cancelled')
  if (!pending || pending.p !== p || pending.exp < Date.now() || typeof input.state !== 'string' || input.state !== pending.state) {
    return fail('expired')
  }
  if (typeof input.code !== 'string') return fail('failed')
  try {
    const claims = readIdToken(await exchangeCode(p, input.code, pending.verifier), p, pending.nonce)
    // Apple sends the person's name once, on their first sign-in, alongside the code.
    let appleName = ''
    if (p === 'apple' && typeof input.user === 'string') {
      try {
        const u = JSON.parse(input.user) as { name?: { firstName?: string; lastName?: string } }
        appleName = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(' ')
      } catch {
        /* ignore */
      }
    }
    const userId = findOrCreateUser(p, claims, appleName)
    createSession(res, userId)
    res.redirect(pending.next)
  } catch (err) {
    console.warn(`[oauth] ${p} sign-in failed:`, (err as Error).message)
    fail((err as Error).message.includes('verified email') ? 'noemail' : 'failed')
  }
}

oauthRouter.get('/oauth/google/callback', limiter, (req, res) => finish('google', req, res, req.query))
oauthRouter.post('/oauth/apple/callback', limiter, (req, res) => finish('apple', req, res, req.body ?? {}))
