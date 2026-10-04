// Types and constants shared by the server and the web app.

export const GENRES = [
  'Billionaire Romance',
  'Revenge',
  'Werewolf & Fantasy',
  'Mafia',
  'Hidden Identity',
  'Family Secrets',
] as const

export type Genre = (typeof GENRES)[number]

export const RATINGS = ['TV-PG', 'TV-14', 'TV-MA'] as const
export type Rating = (typeof RATINGS)[number]

export type PlanId = 'basic' | 'standard' | 'premium'

export interface Plan {
  id: PlanId
  name: string
  /** Monthly price in cents (USD). */
  priceCents: number
  perks: string[]
}

export const PLANS: Plan[] = [
  { id: 'basic', name: 'Basic', priceCents: 499, perks: ['Every episode, every series', '1 screen at a time', 'HD'] },
  {
    id: 'standard',
    name: 'Standard',
    priceCents: 799,
    perks: ['Every episode, every series', '2 screens at a time', 'Full HD', 'Downloads'],
  },
  {
    id: 'premium',
    name: 'Premium',
    priceCents: 1199,
    perks: ['Everything in Standard', '4 screens at a time', 'Early access to new series'],
  },
]

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/** Summary used in browse rows — no episode data. */
export interface SeriesSummary {
  id: string
  title: string
  tagline: string
  synopsis: string
  genres: Genre[]
  year: number
  rating: Rating
  palette: [string, string]
  emoji: string
  posterUrl: string | null
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
  /** Null when the episode is locked for this viewer. */
  videoUrl: string | null
  locked: boolean
}

export interface SeriesDetail extends SeriesSummary {
  episodes: EpisodeView[]
}

/** Prepaid pass lengths. Longer passes are discounted. */
export const DURATIONS = [
  { months: 1, discountPct: 0, label: '1 month' },
  { months: 3, discountPct: 10, label: '3 months' },
  { months: 12, discountPct: 20, label: '12 months' },
] as const

export type DurationMonths = (typeof DURATIONS)[number]['months']

export function priceFor(plan: Plan, months: number): number {
  const d = DURATIONS.find((x) => x.months === months)
  if (!d) throw new Error(`Unsupported duration: ${months}`)
  return Math.round((plan.priceCents * months * (100 - d.discountPct)) / 100)
}

export type PaymentProviderId = 'nowpayments' | 'btcpay' | 'test'

export interface PaymentProviderInfo {
  id: PaymentProviderId
  name: string
  description: string
}

export type OrderStatus = 'pending' | 'confirming' | 'paid' | 'expired' | 'failed'

export interface OrderView {
  id: string
  plan: PlanId
  months: number
  amountCents: number
  provider: PaymentProviderId
  status: OrderStatus
  checkoutUrl: string | null
  createdAt: number
  paidAt: number | null
}

export interface SubscriptionView {
  plan: PlanId
  /** Unix ms when access ends. Null for complimentary access with no end date. */
  currentPeriodEnd: number | null
  source: 'crypto' | 'test' | 'comp'
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
  subscription: SubscriptionView | null
  isEntitled: boolean
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

export interface BillingConfig {
  providers: PaymentProviderInfo[]
}

// ----- Admin -----

export interface AdminSeries extends SeriesSummary {
  published: boolean
  createdAt: number
  updatedAt: number
}

export interface AdminEpisode {
  id: number
  number: number
  title: string
  durationSec: number
  videoUrl: string | null
}

export interface AdminSeriesDetail extends AdminSeries {
  episodes: AdminEpisode[]
}

export interface AdminStats {
  users: number
  newUsers7d: number
  activeSubscribers: number
  subscribersByPlan: Record<PlanId, number>
  mrrCents: number
  revenue30dCents: number
  seriesPublished: number
  seriesDraft: number
  episodes: number
  topSeries: { id: string; title: string; viewers: number }[]
  recentPayments: {
    id: number
    email: string
    amountCents: number
    plan: string | null
    provider: string | null
    createdAt: number
  }[]
}

export interface AdminUser {
  id: number
  email: string
  name: string
  isAdmin: boolean
  createdAt: number
  subscription: SubscriptionView | null
}

export interface SeriesInput {
  id?: string
  title: string
  tagline: string
  synopsis: string
  genres: Genre[]
  year: number
  rating: Rating
  palette: [string, string]
  emoji: string
  isNew: boolean
  trendingRank: number | null
  freeEpisodes: number
  published: boolean
}
