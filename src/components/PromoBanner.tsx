import { Link } from 'react-router-dom'
import { useSession } from '../state/Session'

/** The brand banner at the top of the home page, shown to anyone who isn't a member yet. */
export default function PromoBanner() {
  const { me } = useSession()
  if (me?.isEntitled) return null
  const to = me ? '/plans?return=/' : '/signup'

  return (
    <section className="promo-img" aria-label="Join BingeTube">
      <Link to={to} className="promo-img__art" tabIndex={-1}>
        <picture>
          <source media="(max-width: 700px)" srcSet="/promo/banner-mobile.webp" />
          <img src="/promo/banner.webp" alt="BingeTube: #1 for short drama. No ads, no coins, new episodes daily." fetchPriority="high" />
        </picture>
      </Link>
      <Link to={to} className="btn btn--accent btn--lg promo-img__cta">
        {me ? 'Unlock every episode' : 'Start watching free'}
      </Link>
    </section>
  )
}
