import type { NextFunction, Request, Response } from 'express'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  if (err instanceof Error && err.name === 'MulterError') {
    const tooBig = (err as Error & { code?: string }).code === 'LIMIT_FILE_SIZE'
    res.status(400).json({ error: tooBig ? 'File is too large' : err.message })
    return
  }
  const status = (err as { status?: number }).status
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: (err as Error).message })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong' })
}

// ----- Input validation helpers -----

export function str(value: unknown, field: string, { min = 0, max = 500 } = {}): string {
  if (typeof value !== 'string') throw new HttpError(400, `${field} is required`)
  const v = value.trim()
  if (v.length < min) throw new HttpError(400, min <= 1 ? `${field} is required` : `${field} must be at least ${min} characters`)
  if (v.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`)
  return v
}

export function int(value: unknown, field: string, { min = -Infinity, max = Infinity } = {}): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be a whole number${Number.isFinite(min) ? ` ≥ ${min}` : ''}${Number.isFinite(max) ? ` ≤ ${max}` : ''}`)
  }
  return n
}

export function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, `${field} must be true or false`)
  return value
}

/** Simple fixed-window rate limiter keyed by e.g. IP + route. */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`
    const now = Date.now()
    const entry = hits.get(key)
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k)
      return next()
    }
    entry.count++
    if (entry.count > max) return next(new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.'))
    next()
  }
}
