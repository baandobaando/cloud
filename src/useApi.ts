import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from './api'

/** Fetches a GET endpoint and tracks loading / error state. Pass null to skip. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(url !== null)
  const [nonce, setNonce] = useState(0)

  // A different URL is a different thing: drop the old result so a page never shows the previous item's data
  // (or keeps it when the new request fails). A plain reload keeps the current data on screen.
  const [loadedUrl, setLoadedUrl] = useState(url)
  if (loadedUrl !== url) {
    setLoadedUrl(url)
    setData(undefined)
    setError(null)
  }

  useEffect(() => {
    if (url === null) return
    let cancelled = false
    setLoading(true)
    api
      .get<T>(url)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(null)
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [url, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, setData, error, loading, reload }
}
