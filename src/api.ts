import { ApiError } from './apiError'

export { ApiError }

/** The shareable demo build runs against an in-browser mock of the API. */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1'

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  if (IS_DEMO) {
    const { mockRequest } = await import('./demo/mockApi')
    return mockRequest<T>(method, url, body)
  }
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.")
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`)
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', `/api${url}`),
  post: <T>(url: string, body?: unknown) => request<T>('POST', `/api${url}`, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', `/api${url}`, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', `/api${url}`, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', `/api${url}`),
}

/** Upload with progress reporting (fetch can't report upload progress). */
export function upload<T>(url: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  if (IS_DEMO) return import('./demo/mockApi').then((m) => m.mockUpload<T>(url, form, onProgress))
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${url}`)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      let data: unknown = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        /* non-JSON response */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T)
      else reject(new ApiError(xhr.status, (data as { error?: string } | null)?.error ?? `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection.'))
    xhr.send(form)
  })
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong'
}
