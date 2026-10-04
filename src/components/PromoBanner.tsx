import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { SeriesSummary } from '../../shared/types'
import { useSession } from '../state/Session'
import BrandMark from './BrandMark'

/**
 * Six cover slots fanned out on each side of the pitch, laid out like the Facebook cover art (positions are
 * percentages of the banner). Front slots get the two most popular series, then the outer, then the inner pair.
 * Hovering a cover lifts it out of the shade; the inner two also slide outward so they never cover the copy.
 */
const SLOTS: { pick: number; left: number; top: number; rot: number; scale: number; front?: boolean; dim: number; dx?: number }[] = [
  { pick: 2, left: 22.41, top: 26.7, rot: -12, scale: 0.92, dim: 0.75 },
  { pick: 0, left: 27.01, top: 20.9, rot: -5, scale: 1, front: true, dim: 1 },
  { pick: 4, left: 31.61, top: 30.1, rot: 4, scale: 0.95, dim: 0.55, dx: -38 },
  { pick: 5, left: 61.67, top: 30.1, rot: -4, scale: 0.95, dim: 0.55, dx: 38 },
  { pick: 1, left: 65.91, top: 20.9, rot: 5, scale: 1, front: true, dim: 1 },
  { pick: 3, left: 70.51, top: 26.7, rot: 12, scale: 0.92, dim: 0.75 },
]

/** The brand banner at the top of the home page (desktop and tablet), shown to anyone who isn't a member yet. */
export default function PromoBanner({ catalog }: { catalog: SeriesSummary[] }) {
  const { me } = useSession()
  if (me?.isEntitled) return null
  const covers = catalog.filter((s) => s.posterUrl).slice(0, SLOTS.length)
  if (covers.length < SLOTS.length) return null
  const to = me ? '/plans?return=/' : '/signup'

  return (
    <section className="promo-img" aria-label="Join BingeTube">
      {/* The rainbow-arch outline, in fractions of the banner's box. */}
      <svg width="0" height="0" aria-hidden className="promo-img__defs">
        <clipPath id="promo-arch" clipPathUnits="objectBoundingBox">
          <path d="M0,0.3 Q0.5,-0.26 1,0.3 L1,0.92 Q0.5,0.62 0,0.92 Z" />
        </clipPath>
      </svg>
      <div className="promo-img__band">
        <div className="promo-img__glow" aria-hidden />
        {SLOTS.map((slot) => {
          const s = covers[slot.pick]
          return (
            <Link
              key={s.id}
              to={`/title/${s.id}`}
              className={`promo-img__card${slot.front ? ' promo-img__card--front' : ''}`}
              style={
                { left: `${slot.left}%`, top: `${slot.top}%`, '--rot': `${slot.rot}deg`, '--scale': slot.scale, '--dim': slot.dim, '--dx': `${slot.dx ?? 0}%` } as CSSProperties
              }
              aria-label={s.title}
            >
              <img src={s.posterUrl!} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            </Link>
          )
        })}
        <div className="promo-img__shade" aria-hidden />
        <div className="promo-img__center">
          <div className="promo-img__logo">
            <BrandMark />
            <span className="promo-img__word">
              binge<span>tube</span>
            </span>
          </div>
          <p className="promo-img__tag">
            <b>#1</b> for Short Drama
          </p>
          <ul className="promo-img__chips">
            <li>🚫 No Ads</li>
            <li>🪙 No Coins</li>
            <li>🔥 New Episodes Daily</li>
          </ul>
        </div>
        <Link to={to} className="btn btn--accent btn--lg promo-img__cta">
          {me ? 'Unlock every episode' : 'Start watching free'}
        </Link>
      </div>
    </section>
  )
}
