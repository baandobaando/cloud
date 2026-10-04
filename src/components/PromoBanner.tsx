import { Link } from 'react-router-dom'
import type { SeriesSummary } from '../../shared/types'
import { useSession } from '../state/Session'
import BrandMark from './BrandMark'

/** Fanned-out covers on both sides, the brand pitch in the middle. Shown to anyone who isn't a member yet. */
export default function PromoBanner({ catalog }: { catalog: SeriesSummary[] }) {
  const { me } = useSession()
  if (me?.isEntitled) return null
  const covers = catalog.filter((s) => s.posterUrl).slice(0, 6)
  if (covers.length < 6) return null
  const to = me ? '/plans?return=/' : '/signup'

  const fan = (items: SeriesSummary[], side: 'left' | 'right') => (
    <div className={`promo__fan promo__fan--${side}`} aria-hidden>
      {items.map((s, i) => (
        <Link key={s.id} to={`/title/${s.id}`} tabIndex={-1} className={`promo__card promo__card--${i}`}>
          <img src={s.posterUrl!} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        </Link>
      ))}
    </div>
  )

  return (
    <section className="promo promo--top" aria-label="Join BingeTube">
      <div className="promo__glow" />
      {fan(covers.slice(0, 3), 'left')}
      {fan(covers.slice(3, 6), 'right')}
      <div className="promo__center">
        <div className="promo__logo">
          <BrandMark size={64} />
          <span className="promo__word">
            binge<span>tube</span>
          </span>
        </div>
        <p className="promo__tag">
          <b>#1</b> for Short Drama
        </p>
        <ul className="promo__chips">
          <li>🚫 No Ads</li>
          <li>🪙 No Coins</li>
          <li>🔥 New Episodes Daily</li>
        </ul>
        <Link to={to} className="btn btn--accent btn--lg promo__cta">
          {me ? 'Unlock every episode' : 'Start watching free'}
        </Link>
      </div>
    </section>
  )
}
