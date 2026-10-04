import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from './api'

/** Fetches a GET endpoint and tracks loading / error state. Pass null to skip. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(url !== null)
  const [nonce, setNonce] = useState(0)

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
