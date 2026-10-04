import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import type { Me, ProfileState, SeriesSummary } from './types'

interface Session {
  /** undefined while loading, null when signed out. */
  me: Me | null | undefined
  catalog: SeriesSummary[] | null
  catalogError: string | null
  myList: string[]
  progress: ProfileState['progress']
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  deleteAccount: () => Promise<void>
  refresh: () => Promise<void>
  reloadCatalog: () => void
  toggleMyList: (seriesId: string) => void
  saveProgress: (seriesId: string, episodeNumber: number, position: number) => void
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [catalog, setCatalog] = useState<SeriesSummary[] | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [state, setState] = useState<ProfileState>({ myList: [], progress: {} })
  const profileId = me?.profiles[0]?.id

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me | null>('/me'))
    } catch {
      setMe(null)
    }
  }, [])

  const reloadCatalog = useCallback(() => {
    setCatalogError(null)
    api.get<SeriesSummary[]>('/catalog').then(setCatalog, (e: Error) => setCatalogError(e.message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // The catalog and the viewer's list/progress load once signed in (the app is members-only).
  useEffect(() => {
    if (!me) {
      setState({ myList: [], progress: {} })
      return
    }
    reloadCatalog()
    if (profileId) api.get<ProfileState>(`/profiles/${profileId}/state`).then(setState, () => {})
  }, [me, profileId, reloadCatalog])

  const value = useMemo<Session>(
    () => ({
      me,
      catalog,
      catalogError,
      myList: state.myList,
      progress: state.progress,
      refresh,
      reloadCatalog,
      login: async (email, password) => {
        await api.post('/auth/login', { email, password })
        await refresh()
      },
      signup: async (name, email, password) => {
        await api.post('/auth/signup', { name, email, password })
        await refresh()
      },
      logout: async () => {
        await api.post('/auth/logout').catch(() => {})
        setMe(null)
      },
      deleteAccount: async () => {
        await api.post('/auth/delete-account', { confirm: true })
        setMe(null)
      },
      toggleMyList: (seriesId) => {
        if (!profileId) return
        const inList = state.myList.includes(seriesId)
        setState((s) => ({ ...s, myList: inList ? s.myList.filter((id) => id !== seriesId) : [seriesId, ...s.myList] }))
        const path = `/profiles/${profileId}/list/${encodeURIComponent(seriesId)}`
        ;(inList ? api.del(path) : api.put(path)).catch(() => {})
      },
      saveProgress: (seriesId, episodeNumber, position) => {
        if (!profileId) return
        setState((s) => ({ ...s, progress: { ...s.progress, [seriesId]: { episodeNumber, position, updatedAt: Date.now() } } }))
        api.put(`/profiles/${profileId}/progress/${encodeURIComponent(seriesId)}`, { episodeNumber, position }).catch(() => {})
      },
    }),
    [me, catalog, catalogError, state, profileId, refresh, reloadCatalog],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
