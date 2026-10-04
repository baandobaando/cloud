import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'

/** The brand banner at the top of the home page (desktop and tablet). */
export default function PromoBanner() {
  const { me } = useSession()
  // Members see the banner too, just without the sign-up button.
  const to = me?.isEntitled ? null : me ? '/plans?return=/' : '/signup'

  return (
    <section className="promo-img" aria-label="Join BingeTube">
      <Link to={to ?? '/browse'} className="promo-img__art" tabIndex={-1}>
        <img src="/promo/banner.webp" alt="BingeTube: #1 for short drama. No ads, no coins, new episodes daily." fetchPriority="high" />
      </Link>
      {to && (
        <Link to={to} className="btn btn--accent btn--lg promo-img__cta">
          {me ? 'Unlock every episode' : 'Start watching free'}
        </Link>
      )}
    </section>
  )
}
