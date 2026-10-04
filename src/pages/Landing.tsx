import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PLANS, formatPrice } from '../../shared/types'
import { IS_DEMO } from '../api'
import { useSession } from '../state/Session'
import Poster from '../components/Poster'

export default function Landing() {
  const { catalog } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const cheapest = Math.min(...PLANS.map((p) => p.priceCents))

  return (
    <div className="landing">
      <div className="landing__wall" aria-hidden>
        {[...(catalog ?? []), ...(catalog ?? [])].slice(0, 24).map((s, i) => (
          <Poster key={`${s.id}-${i}`} series={s} />
        ))}
      </div>
      <header className="landing__nav">
        <span className="logo">REELFLIX</span>
        <Link to="/login" className="btn btn--red btn--small">
          Sign In
        </Link>
      </header>
      <section className="landing__hero">
        <h1>Binge-worthy short dramas. One price. Zero coins.</h1>
        <p className="landing__sub">
          Every episode of every series from {formatPrice(cheapest)}/month. Pay with crypto, no card needed.
        </p>
        <form
          className="landing__cta"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(`/signup?email=${encodeURIComponent(email)}`)
          }}
        >
          <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn--red">Get Started ›</button>
        </form>
        {IS_DEMO && (
          <p className="demo-note">
            Interactive demo. Create any account to look around. Everything stays in this browser and payments are
            simulated. <Link to="/login">Admin sign-in details</Link> are on the sign-in page.
          </p>
        )}
        <ul className="landing__points">
          <li>
            <strong>📱 Made for your phone</strong>Swipe through vertical episodes, 1–2 minutes each.
          </li>
          <li>
            <strong>🔓 No per-episode unlocks</strong>One membership unlocks everything. First episodes are always free.
          </li>
          <li>
            <strong>₿ Pay with crypto</strong>BTC, Lightning, ETH, USDT and more. Prepaid passes, no auto-charges.
          </li>
        </ul>
      </section>
    </div>
  )
}
