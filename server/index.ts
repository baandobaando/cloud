import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { accountRouter } from './account.ts'
import { adminRouter } from './admin.ts'
import { authRouter, ensureAdmin, loadUser, pruneExpiredSessions, sameOrigin } from './auth.ts'
import { billingRouter } from './billing.ts'
import { startBunnyAutoImport } from './bunnyImport.ts'
import { catalogRouter, mediaRouter } from './catalog.ts'
import { config, isProduction } from './config.ts'
import { HttpError, errorHandler } from './http.ts'

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
app.use(loadUser)
app.use('/api', (req, res, next) => (req.path.startsWith('/billing/webhooks') ? next() : sameOrigin(req, res, next)))
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})
app.use('/api/auth', authRouter)
app.use('/api', accountRouter)
app.use('/api', catalogRouter)
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
  app.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(distDir, 'index.html'))
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

app.listen(config.port, () => {
  console.log(`[server] BingeTube API listening on http://localhost:${config.port}`)
  startBunnyAutoImport()
})
