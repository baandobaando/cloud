import { API_BASE } from './config'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** JSON request to the BingeTube API. The session cookie is kept by the system networking stack. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "Can't reach BingeTube. Check your connection and try again.")
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Something went wrong (${res.status})`)
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong')
