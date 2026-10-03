import { useLocation, useNavigate } from 'react-router-dom'
import { PLANS } from '../data/catalog'
import { useAppState } from '../state/AppState'

export default function Plans() {
  const { plan, subscribe, cancelSubscription } = useAppState()
  const navigate = useNavigate()
  const returnTo = (useLocation().state as { returnTo?: string } | null)?.returnTo

  return (
    <main className="page page--plans">
      <h1>One subscription. Every episode.</h1>
      <p className="muted">No coins. No per-episode unlocks. Cancel anytime.</p>
      <div className="plans">
        {PLANS.map((p) => (
          <div key={p.id} className={`plan ${plan === p.id ? 'plan--active' : ''} ${p.id === 'standard' ? 'plan--featured' : ''}`}>
            {p.id === 'standard' && <div className="plan__flag">Most Popular</div>}
            <h2>{p.name}</h2>
            <div className="plan__price">{p.price}</div>
            <ul>
              {p.perks.map((perk) => (
                <li key={perk}>✓ {perk}</li>
              ))}
            </ul>
            {plan === p.id ? (
              <button className="btn btn--grey btn--block" disabled>
                Current Plan
              </button>
            ) : (
              <button
                className="btn btn--red btn--block"
                onClick={() => {
                  subscribe(p.id)
                  navigate(returnTo ?? '/')
                }}
              >
                {plan ? 'Switch' : 'Start'} {p.name}
              </button>
            )}
          </div>
        ))}
      </div>
      {plan && (
        <button className="btn btn--link" onClick={cancelSubscription}>
          Cancel subscription
        </button>
      )}
      <p className="muted small">Demo only — no payment is taken. Hook up Stripe or app-store billing before launch.</p>
    </main>
  )
}
