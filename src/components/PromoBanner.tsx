import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'

/** The brand banner at the top of the home page (desktop and tablet), for visitors who aren't signed in. */
export default function PromoBanner() {
  const { me } = useSession()
  // Only for visitors who aren't signed in.
  if (me) return null

  return (
    <section className="promo-img" aria-label="Join BingeTube">
      <Link to="/signup" className="promo-img__art" tabIndex={-1}>
        <img src="/promo/banner.webp" alt="BingeTube: #1 for short drama. No ads, no coins, new episodes daily." fetchPriority="high" />
      </Link>
      <Link to="/signup" className="btn btn--accent btn--lg promo-img__cta">
        Start watching free
      </Link>
    </section>
  )
}
