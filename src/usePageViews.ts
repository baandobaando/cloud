import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/** Counts a page view on every route change (cookie-free; the server keeps only daily, anonymous totals). */
export function usePageViews() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (pathname.startsWith('/admin')) return
    // The outside site that sent the visitor only matters for the first page they land on.
    const body = JSON.stringify({ path: pathname, ref: first.current ? document.referrer : '' })
    first.current = false
    try {
      if (!navigator.sendBeacon?.('/api/t', new Blob([body], { type: 'application/json' }))) {
        void fetch('/api/t', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
      }
    } catch {
      /* counting is best-effort */
    }
  }, [pathname])
}
