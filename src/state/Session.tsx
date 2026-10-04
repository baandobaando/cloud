import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Me, Profile, ProfileState, SeriesSummary } from '../../shared/types'
import { ApiError, api } from '../api'

const ACTIVE_PROFILE_KEY = 'reelflix:profile'

function readStoredProfile(): number | null {
  try {
    const v = Number(localStorage.getItem(ACTIVE_PROFILE_KEY))
    return Number.isInteger(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function storeProfile(id: number | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_PROFILE_KEY, String(id))
    else localStorage.removeItem(ACTIVE_PROFILE_KEY)
  } catch {
    /* storage unavailable */
  }
}

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
  selectProfile: (id: number | null) => void

  catalog: SeriesSummary[] | undefined
  catalogError: string | null

  myList: string[]
  toggleMyList: (seriesId: string) => void
  progress: ProfileState['progress']
  saveProgress: (seriesId: string, episodeNumber: number, position: number) => void
}

const SessionContext = createContext<SessionValue | null>(null)

const EMPTY_STATE: ProfileState = { myList: [], progress: {} }

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [meError, setMeError] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<number | null>(readStoredProfile)
  const [catalog, setCatalog] = useState<SeriesSummary[] | undefined>(undefined)
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
    refreshMe()
  }, [refreshMe])

  // The catalog is public; load it once (and again after sign-in, in case admins see drafts later).
  useEffect(() => {
    api
      .get<SeriesSummary[]>('/catalog')
      .then((c) => {
        setCatalog(c)
        setCatalogError(null)
      })
      .catch((e) => setCatalogError(e.message))
  }, [me?.id])

  const activeProfile = me?.profiles.find((p) => p.id === profileId) ?? null

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

  const selectProfile = useCallback((id: number | null) => {
    storeProfile(id)
    setProfileId(id)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post('/auth/login', { email, password })
      const next = await refreshMe()
      if (next?.profiles.length === 1) selectProfile(next.profiles[0].id)
      else selectProfile(null)
    },
    [refreshMe, selectProfile],
  )

  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      await api.post('/auth/signup', { email, password, name })
      const next = await refreshMe()
      if (next?.profiles[0]) selectProfile(next.profiles[0].id)
    },
    [refreshMe, selectProfile],
  )

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    selectProfile(null)
    setMe(null)
  }, [selectProfile])

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
      selectProfile,
      catalog,
      catalogError,
      myList: profileState.myList,
      toggleMyList,
      progress: profileState.progress,
      saveProgress,
    }),
    [me, meError, refreshMe, login, signup, logout, activeProfile, selectProfile, catalog, catalogError, profileState, toggleMyList, saveProgress],
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
