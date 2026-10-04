// Mirrors the shapes in the website's shared/types.ts that the app uses.

export type Genre = 'Billionaire Romance' | 'Revenge' | 'Werewolf & Fantasy' | 'Mafia' | 'Hidden Identity' | 'Family Secrets'
export const GENRES: Genre[] = ['Billionaire Romance', 'Revenge', 'Werewolf & Fantasy', 'Mafia', 'Hidden Identity', 'Family Secrets']

export interface SeriesSummary {
  id: string
  title: string
  tagline: string
  synopsis: string
  genres: Genre[]
  year: number
  rating: string
  palette: [string, string]
  posterUrl: string | null
  trailerUrl?: string | null
  isNew: boolean
  trendingRank: number | null
  freeEpisodes: number
  episodeCount: number
}

export interface EpisodeView {
  id: number
  number: number
  title: string
  durationSec: number
  videoUrl: string | null
  thumbUrl?: string | null
  locked: boolean
}

export interface SeriesDetail extends SeriesSummary {
  episodes: EpisodeView[]
}

export interface Profile {
  id: number
  name: string
  color: string
}

export interface Me {
  id: number
  email: string
  name: string
  isAdmin: boolean
  isEntitled: boolean
  subscription: { currentPeriodEnd: number | null } | null
  profiles: Profile[]
}

export interface WatchProgress {
  episodeNumber: number
  position: number
  updatedAt: number
}

export interface ProfileState {
  myList: string[]
  progress: Record<string, WatchProgress>
}
