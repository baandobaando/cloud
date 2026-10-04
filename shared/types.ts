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

export type PlanId = 'member'

export interface Plan {
  id: PlanId
  name: string
  /** Monthly price in cents (USD). */
  priceCents: number
  perks: string[]
}

/** One membership; members choose how many months to prepay. */
export const MEMBERSHIP: Plan = {
  id: 'member',
  name: 'Membership',
  priceCents: 999,
  perks: ['Every episode of every series', 'New series every week', 'Watch on any device', 'No coins, no per-episode unlocks'],
}

export const PLANS: Plan[] = [MEMBERSHIP]

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
  /** Episode 1's stream, played muted as a preview on the home page (only set when episode 1 is free). */
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
  /** Null when the episode is locked for this viewer. */
  videoUrl: string | null
  /** Still frame for the episode tile; shown even when the episode is locked. */
  thumbUrl?: string | null
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

export type PaymentProviderId = 'stripe' | 'btcpay' | 'test'

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
  /** 'card' = paid through Stripe, 'crypto' = paid through BTCPay (or the old NOWPayments). */
  source: 'card' | 'crypto' | 'test' | 'comp'
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
  /** False for accounts created with Google/Apple that never set a password. */
  hasPassword?: boolean
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
  /** Extras on the admin list (absent in the offline demo). */
  runtimeSec?: number
  views30d?: number
  viewers30d?: number
  source?: 'bunny' | 'manual'
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
  /** Views per episode number over the last 30 days (shows where viewers drop off). */
  episodeViews30d?: Record<number, number>
  /** Bunny videos an admin removed from this series; the sync won't re-add them. */
  removedFromBunny?: number
}

export interface AdminStats {
  users: number
  newUsers7d: number
  activeSubscribers: number
  /** Paid passes by length in months, e.g. { 1: 12, 3: 5, 12: 2 }. */
  passesByLength: Record<number, number>
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

export const ANALYTICS_RANGES = [
  { id: '7d', label: '7D', days: 7, buckets: 7 },
  { id: '30d', label: '30D', days: 30, buckets: 30 },
  { id: '90d', label: '90D', days: 90, buckets: 45 },
  { id: '12m', label: '12M', days: 360, buckets: 12 },
] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]['id']

/** A number for the selected period, the same number for the period before it, and its points over time. */
export interface Metric {
  value: number
  previous: number
  series: number[]
}

export interface AdminAnalytics {
  range: AnalyticsRange
  /** Start time of each chart bucket (ms), oldest first. */
  buckets: number[]
  bucketMs: number
  kpis: {
    revenueCents: Metric
    signups: Metric
    newMembers: Metric
    payments: Metric
    views: Metric
    activeViewers: Metric
    /** New members ÷ signups in the period, as a percentage. */
    conversion: { value: number; previous: number }
    expired: { value: number; previous: number }
  }
  totals: { users: number; activeMembers: number; mrrCents: number; seriesPublished: number; seriesDraft: number; episodes: number }
  funnel: { label: string; value: number }[]
  passes: { months: number; count: number; revenueCents: number }[]
  currencies: { currency: string; count: number; revenueCents: number }[]
  topSeries: { id: string; title: string; views: number; viewers: number }[]
  expiringSoon: { email: string; endsAt: number }[]
  recentPayments: AdminStats['recentPayments']
}

export interface AdminUser {
  id: number
  email: string
  name: string
  isAdmin: boolean
  createdAt: number
  subscription: SubscriptionView | null
}

/** A row on the admin Users page. */
export interface AdminUserRow extends AdminUser {
  /** Last time any of the user's profiles watched something. */
  lastWatchedAt: number | null
  paidOrders: number
  totalSpentCents: number
  views30d: number
  signInMethods: ('password' | 'google' | 'apple')[]
}

export type AdminUserFilter = 'all' | 'members' | 'comp' | 'expired' | 'free' | 'admins'
export type AdminUserSort = 'newest' | 'oldest' | 'name' | 'spent' | 'active'

export interface AdminUserPage {
  users: AdminUserRow[]
  total: number
  page: number
  pageSize: number
  stats: { total: number; members: number; paying: number; comp: number; expired: number; admins: number; new7d: number }
}

export interface AdminUserDetail {
  user: AdminUserRow
  profiles: { id: number; name: string; color: string; listCount: number; watching: number }[]
  orders: AdminOrder[]
  recentViews: { seriesId: string; seriesTitle: string; episodeNumber: number; at: number }[]
  activeSessions: number
  activity: AdminActivity[]
}

export interface AdminOrder {
  id: string
  userId: number | null
  email: string
  plan: string
  months: number
  amountCents: number
  provider: string
  providerInvoiceId: string | null
  checkoutUrl: string | null
  /** Status as customers see it: stale pending orders read as expired. */
  status: OrderStatus
  payCurrency: string | null
  createdAt: number
  paidAt: number | null
}

export interface AdminOrderPage {
  orders: AdminOrder[]
  total: number
  page: number
  pageSize: number
  stats: { paid: number; revenueCents: number; pending: number; expired: number; failed: number; conversion: number }
}

export interface AdminActivity {
  id: number
  adminEmail: string
  action: string
  target: string
  detail: string
  createdAt: number
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
