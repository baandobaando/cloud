import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bingetube-oauth-'))
process.env.APP_URL = 'http://localhost:5999'
process.env.GOOGLE_CLIENT_ID = 'google-client'
process.env.GOOGLE_CLIENT_SECRET = 'google-secret'
process.env.APPLE_CLIENT_ID = 'tube.binge.web'
process.env.APPLE_TEAM_ID = 'TEAM123'
process.env.APPLE_KEY_ID = 'KEY123'
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
process.env.FACEBOOK_APP_ID = 'fb-app'
process.env.FACEBOOK_APP_SECRET = 'fb-secret'
// Stands in for Apple's identity-token signing key (published at appleid.apple.com/auth/keys).
const appleSigning = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const appleJwk = { ...appleSigning.publicKey.export({ format: 'jwk' }), kid: 'apple-kid', alg: 'RS256', use: 'sig' }
process.env.APPLE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n')

const { default: express } = await import('express')
const { db } = await import('./db.ts')
const { authRouter, loadUser } = await import('./auth.ts')
const { oauthRouter } = await import('./oauth.ts')

const realFetch = globalThis.fetch
let base = ''
let server: ReturnType<ReturnType<typeof express>['listen']>
/** What the fake provider puts in the next ID token, and the last token request it saw. */
let nextClaims: Record<string, unknown> = {}
let lastTokenRequest: URLSearchParams | null = null

const jwt = (claims: Record<string, unknown>) =>
  `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`

before(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/auth/oauth/apple/callback', express.urlencoded({ extended: false }))
  app.use(loadUser)
  app.use('/api/auth', authRouter)
  app.use('/api/auth', oauthRouter)
  app.get('/api/me', (req, res) => res.json(req.user ?? null))
  await new Promise<void>((r) => {
    server = app.listen(0, () => r())
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('https://oauth2.googleapis.com/token') || url.startsWith('https://appleid.apple.com/auth/token')) {
      lastTokenRequest = new URLSearchParams(String(init?.body))
      return new Response(JSON.stringify({ id_token: jwt(nextClaims) }), { status: 200 })
    }
    if (url === 'https://appleid.apple.com/auth/keys') return new Response(JSON.stringify({ keys: [appleJwk] }), { status: 200 })
    if (url.startsWith('https://graph.facebook.com/v21.0/oauth/access_token')) {
      lastTokenRequest = new URL(url).searchParams
      return new Response(JSON.stringify({ access_token: 'fb-token' }), { status: 200 })
    }
    if (url.startsWith('https://graph.facebook.com/v21.0/me')) return new Response(JSON.stringify(nextClaims), { status: 200 })
    return realFetch(input, init)
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = realFetch
  server.close()
})

/** Runs /start, then the provider callback with the given claims; returns the final redirect and cookies. */
async function signIn(p: 'google' | 'apple', claims: (nonce: string) => Record<string, unknown>, extra: Record<string, string> = {}) {
  const start = await realFetch(`${base}/api/auth/oauth/${p}/start?next=/plans`, { redirect: 'manual' })
  const authorize = new URL(start.headers.get('location')!)
  const stateCookie = start.headers.get('set-cookie')!.split(';')[0]
  const state = authorize.searchParams.get('state')!
  nextClaims = claims(authorize.searchParams.get('nonce')!)
  const res =
    p === 'google'
      ? await realFetch(`${base}/api/auth/oauth/google/callback?code=abc&state=${state}`, { redirect: 'manual', headers: { cookie: stateCookie } })
      : await realFetch(`${base}/api/auth/oauth/apple/callback`, {
          method: 'POST',
          redirect: 'manual',
          headers: { cookie: stateCookie, 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code: 'abc', state, ...extra }),
        })
  const session = (res.headers.get('set-cookie') ?? '').match(/rf_session=[^;]+/)?.[0]
  return { location: res.headers.get('location'), session, authorize }
}

const me = async (cookie?: string) =>
  (await (await realFetch(`${base}/api/me`, { headers: cookie ? { cookie } : {} })).json()) as { email: string; name: string }

describe('Sign in with Google', () => {
  test('creates an account, signs in and returns to next', async () => {
    const r = await signIn('google', (nonce) => ({
      iss: 'https://accounts.google.com', aud: 'google-client', sub: 'g-1', exp: Date.now() / 1000 + 300, nonce,
      email: 'Ana@Example.com', email_verified: true, name: 'Ana',
    }))
    assert.equal(r.location, '/plans')
    assert.ok(r.session)
    assert.equal(r.authorize.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(lastTokenRequest?.get('code_verifier')?.length, 64)
    const user = await me(r.session)
    assert.equal(user.email, 'ana@example.com')
    assert.equal(user.name, 'Ana')
  })

  test('signing in again reuses the same account', async () => {
    const r = await signIn('google', (nonce) => ({
      iss: 'accounts.google.com', aud: 'google-client', sub: 'g-1', exp: Date.now() / 1000 + 300, nonce, email: 'ana@example.com', email_verified: true,
    }))
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'ana@example.com'").get() as { n: number }
    assert.equal(n, 1)
    assert.equal((await me(r.session)).email, 'ana@example.com')
  })

  test('rejects a token with the wrong nonce or audience', async () => {
    const wrongNonce = await signIn('google', () => ({
      iss: 'https://accounts.google.com', aud: 'google-client', sub: 'g-2', exp: Date.now() / 1000 + 300, nonce: 'nope', email: 'x@example.com', email_verified: true,
    }))
    assert.match(wrongNonce.location!, /^\/login\?error=failed/)
    assert.equal(wrongNonce.session, undefined)
    const wrongAud = await signIn('google', (nonce) => ({
      iss: 'https://accounts.google.com', aud: 'someone-else', sub: 'g-2', exp: Date.now() / 1000 + 300, nonce, email: 'x@example.com', email_verified: true,
    }))
    assert.match(wrongAud.location!, /^\/login\?error=failed/)
  })

  test('refuses unverified emails', async () => {
    const r = await signIn('google', (nonce) => ({
      iss: 'https://accounts.google.com', aud: 'google-client', sub: 'g-3', exp: Date.now() / 1000 + 300, nonce, email: 'y@example.com', email_verified: false,
    }))
    assert.match(r.location!, /^\/login\?error=noemail/)
  })

  test('a callback without the matching state cookie is rejected', async () => {
    const res = await realFetch(`${base}/api/auth/oauth/google/callback?code=abc&state=forged`, { redirect: 'manual' })
    assert.equal(res.headers.get('location'), '/login?error=expired')
  })
})

describe('Sign in with Apple', () => {
  test('posts back, signs a valid client secret, and keeps the name Apple sends once', async () => {
    const r = await signIn(
      'apple',
      (nonce) => ({ iss: 'https://appleid.apple.com', aud: 'tube.binge.web', sub: 'a-1', exp: Date.now() / 1000 + 300, nonce, email: 'relay@privaterelay.appleid.com', email_verified: 'true' }),
      { user: JSON.stringify({ name: { firstName: 'Sam', lastName: 'Lee' } }) },
    )
    assert.equal(r.location, '/plans')
    assert.equal(r.authorize.searchParams.get('response_mode'), 'form_post')
    assert.equal((await me(r.session)).name, 'Sam Lee')
    // The client secret is an ES256 JWT that Apple can verify with our key.
    const [h, p, sig] = lastTokenRequest!.get('client_secret')!.split('.')
    assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')))
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    assert.deepEqual([claims.iss, claims.sub, claims.aud], ['TEAM123', 'tube.binge.web', 'https://appleid.apple.com'])
  })
})

describe('Password for social-only accounts', () => {
  test('can set a first password without a current one', async () => {
    const r = await signIn('google', (nonce) => ({
      iss: 'https://accounts.google.com', aud: 'google-client', sub: 'g-9', exp: Date.now() / 1000 + 300, nonce, email: 'nopw@example.com', email_verified: true,
    }))
    const res = await realFetch(`${base}/api/auth/password`, {
      method: 'POST',
      headers: { cookie: r.session!, 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'a-new-password' }),
    })
    assert.equal(res.status, 200)
    const login = await realFetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nopw@example.com', password: 'a-new-password' }),
    })
    assert.equal(login.status, 200)
  })
})

describe('Delete account', () => {
  test('removes the user and their session', async () => {
    const r = await signIn('google', (nonce) => ({
      iss: 'https://accounts.google.com', aud: 'google-client', sub: 'g-del', exp: Date.now() / 1000 + 300, nonce, email: 'bye@example.com', email_verified: true,
    }))
    const res = await realFetch(`${base}/api/auth/delete-account`, {
      method: 'POST',
      headers: { cookie: r.session!, 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    assert.equal(res.status, 200)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'bye@example.com'").get()?.n, 0)
    assert.equal(await me(r.session), null)
  })
})

/** An identity token as the iPhone's Sign in with Apple returns it, signed with Apple's (stand-in) key. */
function appleIdentityToken(claims: Record<string, unknown>, key = appleSigning.privateKey) {
  const head = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'apple-kid' })).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`
  return `${head}.${crypto.sign('RSA-SHA256', Buffer.from(head), key).toString('base64url')}`
}

const nativeApple = (body: Record<string, unknown>) =>
  realFetch(`${base}/api/auth/apple/native`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('Native Sign in with Apple (iPhone app)', () => {
  const claims = (extra: Record<string, unknown> = {}) => ({
    iss: 'https://appleid.apple.com', aud: 'tube.binge.app', sub: 'a-native', exp: Date.now() / 1000 + 300, nonce: 'n-1',
    email: 'me@privaterelay.appleid.com', email_verified: 'true', ...extra,
  })

  test('verifies the token against Apple keys and signs in', async () => {
    const res = await nativeApple({ identityToken: appleIdentityToken(claims()), nonce: 'n-1', name: 'Kai Ro' })
    assert.equal(res.status, 200)
    const session = (res.headers.get('set-cookie') ?? '').match(/rf_session=[^;]+/)?.[0]
    const user = await me(session)
    assert.equal(user.email, 'me@privaterelay.appleid.com')
    assert.equal(user.name, 'Kai Ro')
  })

  test('rejects a forged signature, another app, or a replayed nonce', async () => {
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    assert.equal((await nativeApple({ identityToken: appleIdentityToken(claims(), other), nonce: 'n-1' })).status, 401)
    assert.equal((await nativeApple({ identityToken: appleIdentityToken(claims({ aud: 'tube.binge.web' })), nonce: 'n-1' })).status, 401)
    assert.equal((await nativeApple({ identityToken: appleIdentityToken(claims()), nonce: 'other' })).status, 401)
    assert.equal((await nativeApple({ identityToken: appleIdentityToken(claims({ exp: Date.now() / 1000 - 5 })), nonce: 'n-1' })).status, 401)
  })
})

describe('Sign-in started from the iPhone app', () => {
  test('Google hands a one-time code to the app, which trades it for a session once', async () => {
    const start = await realFetch(`${base}/api/auth/oauth/google/start?app=1`, { redirect: 'manual' })
    const authorize = new URL(start.headers.get('location')!)
    const stateCookie = start.headers.get('set-cookie')!.split(';')[0]
    nextClaims = { iss: 'https://accounts.google.com', aud: 'google-client', sub: 'g-app', exp: Date.now() / 1000 + 300, nonce: authorize.searchParams.get('nonce'), email: 'app@example.com', email_verified: true }
    const cb = await realFetch(`${base}/api/auth/oauth/google/callback?code=abc&state=${authorize.searchParams.get('state')}`, { redirect: 'manual', headers: { cookie: stateCookie } })
    const back = new URL(cb.headers.get('location')!)
    assert.equal(back.protocol, 'bingetube:')
    assert.equal(cb.headers.get('set-cookie')?.includes('rf_session='), false)
    const exchange = () => realFetch(`${base}/api/auth/app/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: back.searchParams.get('code') }) })
    const first = await exchange()
    assert.equal(first.status, 200)
    assert.equal((await me((first.headers.get('set-cookie') ?? '').match(/rf_session=[^;]+/)?.[0])).email, 'app@example.com')
    assert.equal((await exchange()).status, 400)
  })

  test('a failed sign-in returns an error to the app', async () => {
    const start = await realFetch(`${base}/api/auth/oauth/google/start?app=1`, { redirect: 'manual' })
    const stateCookie = start.headers.get('set-cookie')!.split(';')[0]
    const cb = await realFetch(`${base}/api/auth/oauth/google/callback?error=access_denied&state=x`, { redirect: 'manual', headers: { cookie: stateCookie } })
    assert.equal(cb.headers.get('location'), 'bingetube://auth?error=cancelled')
  })
})

describe('Log in with Facebook', () => {
  test('exchanges the code, reads the profile and signs in', async () => {
    const start = await realFetch(`${base}/api/auth/oauth/facebook/start?next=/plans`, { redirect: 'manual' })
    const authorize = new URL(start.headers.get('location')!)
    assert.equal(authorize.host, 'www.facebook.com')
    const stateCookie = start.headers.get('set-cookie')!.split(';')[0]
    nextClaims = { id: 'fb-1', name: 'Fay Book', email: 'fay@example.com' }
    const cb = await realFetch(`${base}/api/auth/oauth/facebook/callback?code=abc&state=${authorize.searchParams.get('state')}`, { redirect: 'manual', headers: { cookie: stateCookie } })
    assert.equal(cb.headers.get('location'), '/plans')
    assert.equal(lastTokenRequest?.get('client_secret'), 'fb-secret')
    const user = await me((cb.headers.get('set-cookie') ?? '').match(/rf_session=[^;]+/)?.[0])
    assert.deepEqual([user.email, user.name], ['fay@example.com', 'Fay Book'])
  })

  test('an account without a shared email is refused', async () => {
    const start = await realFetch(`${base}/api/auth/oauth/facebook/start`, { redirect: 'manual' })
    const authorize = new URL(start.headers.get('location')!)
    nextClaims = { id: 'fb-2', name: 'No Mail' }
    const cb = await realFetch(`${base}/api/auth/oauth/facebook/callback?code=abc&state=${authorize.searchParams.get('state')}`, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] } })
    assert.match(cb.headers.get('location')!, /^\/login\?error=noemail/)
  })
})
