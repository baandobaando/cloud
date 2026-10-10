import type {
  AdminEpisode,
  AdminSeries,
  EpisodeView,
  Genre,
  PlanId,
  Rating,
  SeriesSummary,
  SubscriptionView,
} from '../shared/types.ts'
import { resolveMediaUrl, bunnyFileUrl } from './bunny.ts'
import { db } from './db.ts'

export interface SeriesRow {
  id: string
  title: string
  tagline: string
  synopsis: string
  genres: string
  year: number
  rating: string
  palette: string
  emoji: string
  poster_url: string | null
  is_new: number
  trending_rank: number | null
  free_episodes: number
  published: number
  created_at: number
  updated_at: number
  episode_count: number
  first_video_url?: string | null
  bunny_collection_id?: string | null
}

export interface EpisodeRow {
  id: number
  series_id: string
  number: number
  title: string
  duration_sec: number
  video_url: string | null
}

export const SERIES_SELECT = `
  SELECT s.*, (SELECT COUNT(*) FROM episodes e WHERE e.series_id = s.id) AS episode_count,
    (SELECT e.video_url FROM episodes e WHERE e.series_id = s.id ORDER BY e.number LIMIT 1) AS first_video_url
  FROM series s`

export function toSummary(r: SeriesRow): SeriesSummary {
  return {
    id: r.id,
    title: r.title,
    tagline: r.tagline,
    synopsis: r.synopsis,
    genres: JSON.parse(r.genres) as Genre[],
    year: r.year,
    rating: r.rating as Rating,
    palette: JSON.parse(r.palette) as [string, string],
    emoji: r.emoji,
    posterUrl: resolveMediaUrl(r.poster_url),
    // Episode 1 doubles as the muted hero preview, but only when it's free to watch anyway.
    trailerUrl: r.free_episodes > 0 ? resolveMediaUrl(r.first_video_url ?? null) : null,
    isNew: r.is_new === 1,
    trendingRank: r.trending_rank,
    freeEpisodes: r.free_episodes,
    episodeCount: r.episode_count,
  }
}

export function toAdminSeries(r: SeriesRow): AdminSeries {
  return { ...toSummary(r), published: r.published === 1, createdAt: r.created_at, updatedAt: r.updated_at }
}

export function toAdminEpisode(r: EpisodeRow): AdminEpisode {
  return { id: r.id, number: r.number, title: r.title, durationSec: r.duration_sec, videoUrl: resolveMediaUrl(r.video_url) }
}

export function toEpisodeView(r: EpisodeRow, unlocked: boolean): EpisodeView {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    durationSec: r.duration_sec,
    videoUrl: unlocked ? resolveMediaUrl(r.video_url) : null,
    thumbUrl: bunnyFileUrl(r.video_url, 'thumbnail.jpg'),
    locked: !unlocked,
  }
}

interface SubscriptionRow {
  plan: string
  current_period_end: number | null
  source: string
  stripe_subscription_id: string | null
  status: string | null
  cancel_at_period_end: number
  trial_end: number | null
}

/** Stripe subscription states in which the member keeps access. */
export const LIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due']

export function getSubscription(userId: number): SubscriptionView | null {
  const row = db
    .prepare('SELECT plan, current_period_end, source, stripe_subscription_id, status, cancel_at_period_end, trial_end FROM subscriptions WHERE user_id = ?')
    .get(userId) as SubscriptionRow | undefined
  if (!row) return null
  const live = (!!row.stripe_subscription_id || row.source === 'apple') && LIVE_SUBSCRIPTION_STATUSES.includes(row.status ?? '')
  return {
    plan: row.plan as PlanId,
    currentPeriodEnd: row.current_period_end,
    source: row.source as SubscriptionView['source'],
    renews: live && !row.cancel_at_period_end,
    cancelAtPeriodEnd: live && !!row.cancel_at_period_end,
    trialEndsAt: live && row.status === 'trialing' ? row.trial_end : null,
    paymentFailed: live && row.status === 'past_due',
  }
}

export function isActive(sub: SubscriptionView | null): boolean {
  return !!sub && (sub.currentPeriodEnd === null || sub.currentPeriodEnd > Date.now())
}

/** Whether this user may watch every episode. Admins always can (to review content). */
export function isEntitled(user: { id: number; isAdmin: boolean } | undefined): boolean {
  if (!user) return false
  return user.isAdmin || isActive(getSubscription(user.id))
}
