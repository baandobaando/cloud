import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Me, Profile, ProfileState, SeriesSummary } from '../../shared/types'
import { ApiError, api } from '../api'

interface SessionValue {
  /** undefined while loading, null when signed out. */
  me: Me | null | undefined
  /** Set when the session couldn't be checked (network/server error), as opposed to being signed out. */
  meError: string | null
  refreshMe: () => Promise<Me | null>
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>

  activeProfile: Profile | null

  catalog: SeriesSummary[] | undefined
  catalogError: string | null

  myList: string[]
  toggleMyList: (seriesId: string) => void
  progress: ProfileState['progress']
  saveProgress: (seriesId: string, episodeNumber: number, position: number) => void
}

const SessionContext = createContext<SessionValue | null>(null)

const EMPTY_STATE: ProfileState = { myList: [], progress: {} }

/** The server bakes the viewer's account and the catalog into the page; read it once, then let it go. */
declare global {
  interface Window {
    __BOOT__?: { me: Me | null; catalog: SeriesSummary[] }
  }
}
const BOOT = typeof window !== 'undefined' ? window.__BOOT__ : undefined
if (BOOT) delete window.__BOOT__

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(BOOT?.me)
  const [meError, setMeError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<SeriesSummary[] | undefined>(BOOT?.catalog)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [profileState, setProfileState] = useState<ProfileState>(EMPTY_STATE)

  const refreshMe = useCallback(async () => {
    try {
      const next = await api.get<Me | null>('/me')
      setMe(next)
      setMeError(null)
      return next
    } catch (err) {
      // A 401 means signed out; anything else (offline, server down) shouldn't silently sign the viewer out.
      if (err instanceof ApiError && err.status === 401) {
        setMe(null)
      } else {
        setMeError(err instanceof Error ? err.message : 'Could not reach BingeTube')
      }
      return null
    }
  }, [])

  useEffect(() => {
    if (!BOOT) refreshMe()
  }, [refreshMe])

  // The catalog is public and the same for everyone, so it's loaded once (the page usually ships it already).
  useEffect(() => {
    if (BOOT) return
    api
      .get<SeriesSummary[]>('/catalog')
      .then((c) => {
        setCatalog(c)
        setCatalogError(null)
      })
      .catch((e) => setCatalogError(e.message))
  }, [])

  // Every account has exactly one profile, used automatically.
  const activeProfile = me?.profiles[0] ?? null

  useEffect(() => {
    if (!activeProfile) {
      setProfileState(EMPTY_STATE)
      return
    }
    let cancelled = false
    api
      .get<ProfileState>(`/profiles/${activeProfile.id}/state`)
      .then((s) => !cancelled && setProfileState(s))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeProfile?.id])

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post('/auth/login', { email, password })
      await refreshMe()
    },
    [refreshMe],
  )

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      await api.post('/auth/signup', { email, password, name })
      await refreshMe()
    },
    [refreshMe],
  )

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    setMe(null)
  }, [])

  const toggleMyList = useCallback(
    (seriesId: string) => {
      if (!activeProfile) return
      const inList = profileState.myList.includes(seriesId)
      // Optimistic update; roll back if the request fails.
      setProfileState((s) => ({
        ...s,
        myList: inList ? s.myList.filter((id) => id !== seriesId) : [seriesId, ...s.myList],
      }))
      const path = `/profiles/${activeProfile.id}/list/${encodeURIComponent(seriesId)}`
      ;(inList ? api.del(path) : api.put(path)).catch(() =>
        setProfileState((s) => ({
          ...s,
          myList: inList ? [seriesId, ...s.myList] : s.myList.filter((id) => id !== seriesId),
        })),
      )
    },
    [activeProfile, profileState.myList],
  )

  const saveProgress = useCallback(
    (seriesId: string, episodeNumber: number, position: number) => {
      if (!activeProfile) return
      setProfileState((s) => ({
        ...s,
        progress: { ...s.progress, [seriesId]: { episodeNumber, position, updatedAt: Date.now() } },
      }))
      api
        .put(`/profiles/${activeProfile.id}/progress/${encodeURIComponent(seriesId)}`, { episodeNumber, position })
        .catch(() => {})
    },
    [activeProfile],
  )

  const value = useMemo<SessionValue>(
    () => ({
      me,
      meError,
      refreshMe,
      login,
      signup,
      logout,
      activeProfile,
      catalog,
      catalogError,
      myList: profileState.myList,
      toggleMyList,
      progress: profileState.progress,
      saveProgress,
    }),
    [me, meError, refreshMe, login, signup, logout, activeProfile, catalog, catalogError, profileState, toggleMyList, saveProgress],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

/** Looks up a series summary from the loaded catalog. */
export function useSeriesSummary(id: string): SeriesSummary | undefined {
  const { catalog } = useSession()
  return catalog?.find((s) => s.id === id)
}
