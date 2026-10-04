import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MEMBERSHIP, formatPrice } from '../../shared/types'
import { IS_DEMO } from '../api'
import { useSession } from '../state/Session'
import Poster from '../components/Poster'
import Logo from '../components/Logo'
import Icon, { type IconName } from '../components/Icon'
import { usePageTitle } from '../usePageTitle'

const POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'phone', title: 'Made for your phone', text: 'Vertical episodes, one to two minutes each. Swipe up for the next one.' },
  { icon: 'unlock', title: 'No coins, no unlocks', text: 'One membership opens every episode. The first few of each series are free.' },
  { icon: 'card', title: 'Simple checkout', text: 'Card, Apple Pay or Google Pay through Stripe. Prepaid, so nothing renews behind your back.' },
]

export default function Landing() {
  usePageTitle('Welcome')
  const { catalog } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const wall = catalog?.slice(0, 6) ?? []

  return (
    <div className="landing">
      <header className="landing__nav">
        <Logo />
        <Link to="/login" className="btn btn--glass btn--small">
          Sign in
        </Link>
      </header>

      <section className="landing__hero">
        <div className="landing__copy">
          <span className="eyebrow">Short dramas, binge-sized</span>
          <h1>Your next obsession is ninety seconds long.</h1>
          <p className="landing__sub">
            Every episode of every series for {formatPrice(MEMBERSHIP.priceCents)} a month. Start free, no card needed.
          </p>
          <form
            className="landing__cta"
            onSubmit={(e) => {
              e.preventDefault()
              navigate(`/signup?email=${encodeURIComponent(email)}`)
            }}
          >
            <input id="landing-email" type="email" aria-label="Email address" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn--accent btn--lg">Start watching</button>
          </form>
          {IS_DEMO && (
            <p className="demo-note">
              Interactive demo. Create any account to look around; everything stays in this browser and payments are
              simulated. <Link to="/login">Admin sign-in details</Link> are on the sign-in page.
            </p>
          )}
        </div>
        <div className="landing__stack" aria-hidden>
          {wall.map((s) => (
            <Poster key={s.id} series={s} />
          ))}
        </div>
      </section>

      <ul className="landing__points">
        {POINTS.map((p) => (
          <li key={p.title}>
            <span className="landing__icon">
              <Icon name={p.icon} />
            </span>
            <strong>{p.title}</strong>
            <span>{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
