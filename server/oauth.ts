import crypto from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { config, isProduction } from './config.ts'
import { db } from './db.ts'
import { createSession, createUser, readCookie } from './auth.ts'
import { rateLimit } from './http.ts'

/**
 * "Continue with Google / Apple / Facebook": OpenID Connect (Google, Apple) or OAuth 2 (Facebook), authorization
 * code flow. Each provider is only offered once its keys are set; see .env.example.
 *
 * The iPhone app signs in with Apple natively (POST /apple/native). For Google and Facebook it opens the same web
 * flow in a sign-in sheet with `app=1`; the callback then hands a one-time code back to the app's URL scheme, which
 * the app trades for a session (POST /app/exchange), because the sheet's cookies aren't the app's.
 */

type Provider = 'google' | 'apple' | 'facebook'
const STATE_COOKIE = 'rf_oauth'
const STATE_TTL_MS = 10 * 60 * 1000
// Users created through Google/Apple have no password; this never matches a scrypt hash.
const NO_PASSWORD = '!oauth'

export function enabledProviders(): Record<Provider | 'appleNative', boolean> {
  const { google, apple, facebook } = config
  return {
    google: Boolean(google.clientId && google.clientSecret),
    apple: Boolean(apple.clientId && apple.teamId && apple.keyId && apple.privateKey),
    facebook: Boolean(facebook.appId && facebook.appSecret),
    // Native Sign in with Apple only needs Apple's public keys and the app's bundle ID.
    appleNative: Boolean(apple.bundleId),
  }
}

const FB_GRAPH = 'https://graph.facebook.com/v21.0'

const redirectUri = (p: Provider) => `${config.appUrl}/api/auth/oauth/${p}/callback`
const b64url = (buf: Buffer) => buf.toString('base64url')
const random = () => b64url(crypto.randomBytes(24))

interface PendingLogin {
  p: Provider
  state: string
  nonce: string
  verifier: string
  next: string
  /** Started from the iPhone app: finish by handing a one-time code to the app instead of setting a cookie. */
  app?: boolean
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
function readIdToken(idToken: string, p: Provider, nonce: string, audience = p === 'google' ? config.google.clientId : config.apple.clientId): IdClaims {
  const claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as IdClaims
  const issuers = p === 'google' ? ['https://accounts.google.com', 'accounts.google.com'] : ['https://appleid.apple.com']
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!issuers.includes(claims.iss)) throw new Error('Unexpected issuer')
  if (!aud.includes(audience)) throw new Error('Token is for another app')
  if (claims.exp * 1000 < Date.now()) throw new Error('Token expired')
  if (claims.nonce !== nonce) throw new Error('Nonce mismatch')
  if (!claims.sub) throw new Error('Missing subject')
  return claims
}

/** Facebook isn't OpenID Connect: trade the code for an access token, then ask the Graph API who it belongs to. */
async function facebookClaims(code: string): Promise<IdClaims> {
  const { appId, appSecret } = config.facebook
  const tokenUrl = `${FB_GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri('facebook'), code })}`
  const tok = (await (await fetch(tokenUrl)).json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } }
  if (!tok.access_token) throw new Error(`Token exchange failed: ${tok.error?.message ?? 'no token'}`)
  const proof = crypto.createHmac('sha256', appSecret).update(tok.access_token).digest('hex')
  const meUrl = `${FB_GRAPH}/me?${new URLSearchParams({ fields: 'id,name,email', access_token: tok.access_token, appsecret_proof: proof })}`
  const me = (await (await fetch(meUrl)).json().catch(() => ({}))) as { id?: string; name?: string; email?: string }
  if (!me.id) throw new Error('Facebook did not return the account')
  // Facebook only shares an email address the person has confirmed.
  return { iss: 'facebook', aud: appId, sub: me.id, exp: Date.now() / 1000 + 60, email: me.email, email_verified: Boolean(me.email), name: me.name }
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
  const pending: PendingLogin = {
    p,
    state: random(),
    nonce: random(),
    verifier: random() + random(),
    next: safeNext(req.query.next),
    app: req.query.app === '1' || undefined,
    exp: Date.now() + STATE_TTL_MS,
  }
  res.cookie(STATE_COOKIE, b64url(Buffer.from(JSON.stringify(pending))), stateCookieOptions(p))
  if (p === 'facebook') {
    const fb = new URLSearchParams({ client_id: config.facebook.appId, redirect_uri: redirectUri(p), state: pending.state, scope: 'public_profile,email', response_type: 'code' })
    return res.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${fb}`)
  }
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
  const fail = (code: string) =>
    pending?.app
      ? res.redirect(`${config.appScheme}://auth?error=${code}`)
      : res.redirect(`/login?error=${code}${pending ? `&next=${encodeURIComponent(pending.next)}` : ''}`)

  if (input.error) return fail('cancelled')
  if (!pending || pending.p !== p || pending.exp < Date.now() || typeof input.state !== 'string' || input.state !== pending.state) {
    return fail('expired')
  }
  if (typeof input.code !== 'string') return fail('failed')
  try {
    const claims = p === 'facebook' ? await facebookClaims(input.code) : readIdToken(await exchangeCode(p, input.code, pending.verifier), p, pending.nonce)
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
    if (pending.app) return res.redirect(`${config.appScheme}://auth?code=${issueAppCode(userId)}`)
    createSession(res, userId)
    res.redirect(pending.next)
  } catch (err) {
    console.warn(`[oauth] ${p} sign-in failed:`, (err as Error).message)
    fail((err as Error).message.includes('verified email') ? 'noemail' : 'failed')
  }
}

oauthRouter.get('/oauth/google/callback', limiter, (req, res) => finish('google', req, res, req.query))
oauthRouter.get('/oauth/facebook/callback', limiter, (req, res) => finish('facebook', req, res, req.query))
oauthRouter.post('/oauth/apple/callback', limiter, (req, res) => finish('apple', req, res, req.body ?? {}))

/** One-time codes that hand a finished Google/Facebook sign-in to the iPhone app (kept for two minutes). */
const APP_CODE_TTL_MS = 2 * 60 * 1000
const appCodes = new Map<string, { userId: number; exp: number }>()

function issueAppCode(userId: number): string {
  const now = Date.now()
  for (const [k, v] of appCodes) if (v.exp < now) appCodes.delete(k)
  const code = random()
  appCodes.set(crypto.createHash('sha256').update(code).digest('hex'), { userId, exp: now + APP_CODE_TTL_MS })
  return code
}

oauthRouter.post('/app/exchange', limiter, (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : ''
  const key = crypto.createHash('sha256').update(code).digest('hex')
  const entry = appCodes.get(key)
  appCodes.delete(key)
  if (!entry || entry.exp < Date.now()) return res.status(400).json({ error: 'That sign-in expired. Please try again.' })
  createSession(res, entry.userId)
  res.json({ ok: true })
})

/** Apple's signing keys for identity tokens, cached for an hour. */
let appleKeys: { at: number; keys: (crypto.JsonWebKey & { kid?: string })[] } | null = null
async function appleKey(kid: string): Promise<crypto.KeyObject> {
  if (!appleKeys || Date.now() - appleKeys.at > 60 * 60 * 1000 || !appleKeys.keys.some((k) => k.kid === kid)) {
    const res = await fetch('https://appleid.apple.com/auth/keys')
    const json = (await res.json().catch(() => ({}))) as { keys?: (crypto.JsonWebKey & { kid?: string })[] }
    if (!res.ok || !json.keys) throw new Error('Could not load Apple keys')
    appleKeys = { at: Date.now(), keys: json.keys }
  }
  const jwk = appleKeys.keys.find((k) => k.kid === kid)
  if (!jwk) throw new Error('Unknown Apple key')
  return crypto.createPublicKey({ key: jwk, format: 'jwk' })
}

/**
 * Native Sign in with Apple from the iPhone app. The identity token comes from the device, so unlike the web flow its
 * signature is checked against Apple's published keys, along with issuer, audience (the app), expiry and nonce.
 */
oauthRouter.post('/apple/native', limiter, async (req, res) => {
  const { identityToken, nonce, name } = (req.body ?? {}) as { identityToken?: unknown; nonce?: unknown; name?: unknown }
  if (typeof identityToken !== 'string' || typeof nonce !== 'string' || !nonce) {
    return res.status(400).json({ error: 'Sign in with Apple did not complete. Please try again.' })
  }
  try {
    const [h, p, sig] = identityToken.split('.')
    const header = JSON.parse(Buffer.from(h ?? '', 'base64url').toString('utf8')) as { alg?: string; kid?: string }
    if (header.alg !== 'RS256' || !header.kid || !p || !sig) throw new Error('Malformed token')
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), await appleKey(header.kid), Buffer.from(sig, 'base64url'))
    if (!ok) throw new Error('Bad signature')
    const claims = readIdToken(identityToken, 'apple', nonce, config.apple.bundleId)
    const userId = findOrCreateUser('apple', claims, typeof name === 'string' ? name.trim() : '')
    createSession(res, userId)
    res.json({ ok: true })
  } catch (err) {
    console.warn('[oauth] native apple sign-in failed:', (err as Error).message)
    const noEmail = (err as Error).message.includes('verified email')
    res.status(401).json({ error: noEmail ? 'Your Apple ID did not share an email address.' : 'Sign in with Apple failed. Please try again.' })
  }
})
