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
