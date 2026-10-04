import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'
import BrandMark from './BrandMark'

/**
 * Covers fanned out on each side of the pitch, laid out exactly like the Facebook cover art (positions are percentages
 * of the banner, measured from that design). Each cover lifts out of the shadow when hovered and opens its series;
 * the two inner ones also slide outward so they never cover the copy.
 */
const CARDS: { img: string; id: string; title: string; left: number; top: number; rot: number; scale: number; front?: boolean; dim: number; dx?: number }[] = [
  { img: '16', id: 'hands-off-my-girl-dragon-queen-returns', title: 'Hands Off my Girl: Dragon Queen Returns', left: 22.41, top: 27.51, rot: -10, scale: 0.92, dim: 0.75 },
  { img: '1', id: 'he-gave-our-baby-to-his-mistress-then-i-was-reborn', title: 'He Gave Our Baby to His Mistress, Then I Was Reborn', left: 27.01, top: 20.46, rot: -4, scale: 1, front: true, dim: 1 },
  { img: '3', id: 'he-divorced-me-but-i-m-the-elven-princess', title: "He Divorced Me, But I'm the Elven Princess", left: 31.61, top: 31.73, rot: 5, scale: 0.95, dim: 0.55, dx: -38 },
  { img: '7', id: 'he-cheated-so-i-slept-with-his-brother', title: 'He Cheated, So I Slept With His Brother', left: 61.67, top: 31.73, rot: -5, scale: 0.95, dim: 0.55, dx: 38 },
  { img: '36', id: 'get-out-of-my-bugatti', title: 'Get Out of My Bugatti', left: 65.91, top: 20.46, rot: 4, scale: 1, front: true, dim: 1 },
  { img: '18', id: 'he-begs-for-the-heart-he-broke-120-times', title: 'He Begs for the Heart He Broke 120 Times', left: 70.51, top: 27.51, rot: 10, scale: 0.92, dim: 0.75 },
]

/** The brand banner at the top of the home page (desktop and tablet), shown to anyone who isn't a member yet. */
export default function PromoBanner() {
  const { me } = useSession()
  if (me?.isEntitled) return null
  const to = me ? '/plans?return=/' : '/signup'

  return (
    <section className="promo-img" aria-label="Join BingeTube">
      <div className="promo-img__glow" aria-hidden />
      {CARDS.map((c) => (
        <Link
          key={c.id}
          to={`/title/${c.id}`}
          className={`promo-img__card${c.front ? ' promo-img__card--front' : ''}`}
          style={{ left: `${c.left}%`, top: `${c.top}%`, '--rot': `${c.rot}deg`, '--scale': c.scale, '--dim': c.dim, '--dx': `${c.dx ?? 0}%` } as CSSProperties}
          aria-label={c.title}
        >
          <img src={`/promo/cards/${c.img}.webp`} alt="" />
        </Link>
      ))}
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
    </section>
  )
}
