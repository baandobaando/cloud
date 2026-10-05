import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { accountRouter, buildMe } from './account.ts'
import { adminRouter } from './admin.ts'
import { oauthRouter } from './oauth.ts'
import { pruneTraffic, trafficRouter } from './traffic.ts'
import { authRouter, ensureAdmin, loadUser, pruneExpiredSessions, sameOrigin } from './auth.ts'
import { billingRouter } from './billing.ts'
import { startBunnyAutoImport } from './bunnyImport.ts'
import { startStripeAccountMonitor } from './payments/stripe.ts'
import { catalogRouter, mediaRouter, publicCatalog } from './catalog.ts'
import { config, isProduction } from './config.ts'
import { HttpError, errorHandler } from './http.ts'
import { HOME_SUMMARY_HTML, PRIVACY_HTML, SUPPORT_HTML, TERMS_HTML, legalArticle } from '../shared/legal.ts'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

// Webhooks need the exact raw bytes to verify signatures, so they skip the JSON parser.
app.use('/api/billing/webhooks', express.raw({ type: '*/*', limit: '1mb' }))
app.use(express.json({ limit: '1mb' }))
// Sign in with Apple posts its callback as a form.
app.use('/api/auth/oauth/apple/callback', express.urlencoded({ extended: false, limit: '64kb' }))
app.use(loadUser)
app.use('/api', (req, res, next) => (req.path.startsWith('/billing/webhooks') || req.path === '/auth/oauth/apple/callback' ? next() : sameOrigin(req, res, next)))
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})
app.use('/api/auth', authRouter)
app.use('/api/auth', oauthRouter)
app.use('/api', accountRouter)
app.use('/api', catalogRouter)
app.use('/api', trafficRouter)
app.use('/api/billing', billingRouter)
app.use('/api/admin', adminRouter)
app.use('/media', mediaRouter)
app.use('/api', () => {
  throw new HttpError(404, 'Not found')
})

// In production the server also serves the built web app.
const distDir = path.resolve('dist')
if (isProduction && fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1y', immutable: true }))
  // Pages crawlers must be able to read without JavaScript get their text baked into the HTML; the app replaces it on load.
  const shell = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8')
  const page = (title: string | null, inner: string) =>
    (title ? shell.replace(/<title>[^<]*<\/title>/, `<title>${title} · BingeTube</title>`) : shell).replace(
      '<!--prerender-->',
      () => inner,
    )
  const prerendered: Record<string, string> = {
    '/': page(null, `<main class="page prerender">${HOME_SUMMARY_HTML}</main>`),
    '/privacy': page('Privacy Policy', `<main class="page">${legalArticle('Privacy Policy', PRIVACY_HTML)}</main>`),
    '/terms': page('Terms of Service', `<main class="page">${legalArticle('Terms of Service', TERMS_HTML)}</main>`),
    '/support': page('Help & Support', `<main class="page">${legalArticle('Help & Support', SUPPORT_HTML, 'Support')}</main>`),
  }
  // The catalog and the viewer's account go into the page itself, so the app can draw the first screen as soon as its
  // script runs instead of waiting on two more round trips. The catalog is the same for everyone, so it's cached briefly.
  let catalogCache: { at: number; json: string } | null = null
  const catalogJson = () => {
    if (!catalogCache || Date.now() - catalogCache.at > 60_000) catalogCache = { at: Date.now(), json: JSON.stringify(publicCatalog()) }
    return catalogCache.json
  }
  // Every "<" in the data is escaped so nothing in a title or name can close the script tag.
  const bootScript = (req: express.Request) => {
    const data = `{"me":${JSON.stringify(req.user ? buildMe(req.user) : null)},"catalog":${catalogJson()}}`.replace(/</g, '\\u003c')
    return `<script>window.__BOOT__=${data}</script>`
  }
  app.get(/.*/, (req, res) => {
    res.setHeader('Cache-Control', 'private, no-cache')
    const html = prerendered[req.path.replace(/\/+$/, '') || '/'] ?? shell
    res.type('html').send(html.replace('</head>', () => `${bootScript(req)}</head>`)) // a function, so "$" in data isn't a replace pattern
  })
}

// In development the website runs on Vite (port 5173); send stray visits to the API port there.
if (!isProduction) {
  app.get(/^\/(?!api\/|media\/).*/, (req, res) => res.redirect(`${config.appUrl}${req.originalUrl}`))
}

app.use(errorHandler)

await ensureAdmin()
pruneExpiredSessions()
setInterval(pruneExpiredSessions, 6 * 60 * 60 * 1000).unref()
pruneTraffic()
setInterval(pruneTraffic, 24 * 60 * 60 * 1000).unref()

app.listen(config.port, () => {
  console.log(`[server] BingeTube API listening on http://localhost:${config.port}`)
  startBunnyAutoImport()
  startStripeAccountMonitor()
})
