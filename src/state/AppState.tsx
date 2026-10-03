import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Plan } from '../data/catalog'

export interface Profile {
  id: string
  name: string
  color: string
}

export interface WatchProgress {
  episodeNumber: number
  /** Seconds into the episode. */
  position: number
  updatedAt: number
}

interface ProfileData {
  myList: string[]
  progress: Record<string, WatchProgress>
}

interface PersistedState {
  profiles: Profile[]
  activeProfileId: string | null
  plan: Plan['id'] | null
  data: Record<string, ProfileData>
}

const STORAGE_KEY = 'reelflix:v1'

const DEFAULT_STATE: PersistedState = {
  profiles: [
    { id: 'p1', name: 'You', color: '#e50914' },
    { id: 'p2', name: 'Bestie', color: '#2563eb' },
    { id: 'p3', name: 'Mom', color: '#16a34a' },
  ],
  activeProfileId: null,
  plan: null,
  data: {},
}

const EMPTY_PROFILE_DATA: ProfileData = { myList: [], progress: {} }

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return DEFAULT_STATE
}

interface AppStateValue {
  profiles: Profile[]
  activeProfile: Profile | null
  selectProfile: (id: string | null) => void
  addProfile: (name: string) => void
  plan: Plan['id'] | null
  subscribe: (plan: Plan['id']) => void
  cancelSubscription: () => void
  myList: string[]
  toggleMyList: (seriesId: string) => void
  progress: Record<string, WatchProgress>
  saveProgress: (seriesId: string, episodeNumber: number, position: number) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

const PROFILE_COLORS = ['#e50914', '#2563eb', '#16a34a', '#9333ea', '#f59e0b', '#db2777']

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Ignore quota / private-mode errors.
    }
  }, [state])

  const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) ?? null
  const profileData = (activeProfile && state.data[activeProfile.id]) || EMPTY_PROFILE_DATA

  const updateProfileData = useCallback((fn: (d: ProfileData) => ProfileData) => {
    setState((s) => {
      if (!s.activeProfileId) return s
      const current = s.data[s.activeProfileId] ?? EMPTY_PROFILE_DATA
      return { ...s, data: { ...s.data, [s.activeProfileId]: fn(current) } }
    })
  }, [])

  const selectProfile = useCallback((id: string | null) => {
    setState((s) => ({ ...s, activeProfileId: id }))
  }, [])

  const addProfile = useCallback((name: string) => {
    setState((s) => {
      const id = `p${Date.now()}`
      const color = PROFILE_COLORS[s.profiles.length % PROFILE_COLORS.length]
      return { ...s, profiles: [...s.profiles, { id, name, color }] }
    })
  }, [])

  const subscribe = useCallback((plan: Plan['id']) => setState((s) => ({ ...s, plan })), [])
  const cancelSubscription = useCallback(() => setState((s) => ({ ...s, plan: null })), [])

  const toggleMyList = useCallback(
    (seriesId: string) =>
      updateProfileData((d) => ({
        ...d,
        myList: d.myList.includes(seriesId) ? d.myList.filter((id) => id !== seriesId) : [seriesId, ...d.myList],
      })),
    [updateProfileData],
  )

  const saveProgress = useCallback(
    (seriesId: string, episodeNumber: number, position: number) =>
      updateProfileData((d) => ({
        ...d,
        progress: { ...d.progress, [seriesId]: { episodeNumber, position, updatedAt: Date.now() } },
      })),
    [updateProfileData],
  )

  const value = useMemo<AppStateValue>(
    () => ({
      profiles: state.profiles,
      activeProfile,
      selectProfile,
      addProfile,
      plan: state.plan,
      subscribe,
      cancelSubscription,
      myList: profileData.myList,
      toggleMyList,
      progress: profileData.progress,
      saveProgress,
    }),
    [state.profiles, state.plan, activeProfile, profileData, selectProfile, addProfile, subscribe, cancelSubscription, toggleMyList, saveProgress],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider')
  return ctx
}
