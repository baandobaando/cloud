import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DURATIONS,
  PLANS,
  formatPrice,
  priceFor,
  type BillingConfig,
  type PaymentProviderId,
  type PlanId,
} from '../../shared/types'
import { api, errorMessage } from '../api'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'

const PROVIDER_ICONS: Record<PaymentProviderId, string> = { nowpayments: '🪙', btcpay: '₿', test: '🧪' }

export default function Plans() {
  const { me } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: billing, error, reload } = useApi<BillingConfig>('/billing/config')
  const [plan, setPlan] = useState<PlanId>(me?.subscription?.plan ?? 'standard')
  const [months, setMonths] = useState<number>(3)
  const [provider, setProvider] = useState<PaymentProviderId | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    if (billing && !provider && billing.providers[0]) setProvider(billing.providers[0].id)
  }, [billing, provider])

  if (error) return <main className="page"><ErrorState message={error} onRetry={reload} /></main>
  if (!billing) return <Spinner fullscreen />

  const selectedPlan = PLANS.find((p) => p.id === plan)!
  const total = priceFor(selectedPlan, months)
  const sub = me?.subscription
  const activeUntil = sub?.currentPeriodEnd && sub.currentPeriodEnd > Date.now() ? sub.currentPeriodEnd : null

  const checkout = async () => {
    if (!provider) return
    setBusy(true)
    setCheckoutError(null)
    try {
      const returnTo = params.get('return')
      if (returnTo?.startsWith('/')) sessionStorage.setItem('reelflix:return', returnTo)
      const { checkoutUrl } = await api.post<{ orderId: string; checkoutUrl: string }>('/billing/orders', {
        plan,
        months,
        provider,
      })
      if (checkoutUrl.startsWith('/')) navigate(checkoutUrl)
      else window.location.assign(checkoutUrl)
    } catch (err) {
      setCheckoutError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="page page--plans">
      <h1>{me?.isEntitled ? 'Add more time' : 'One membership. Every episode.'}</h1>
      <p className="muted">
        {activeUntil
          ? `You're a member until ${new Date(activeUntil).toLocaleDateString()}. New time is added on top.`
          : 'No coins. No per-episode unlocks. Prepaid with crypto. Nothing renews automatically.'}
      </p>

      <h2 className="step">1. Choose your plan</h2>
      <div className="plans">
        {PLANS.map((p) => (
          <button
            key={p.id}
            className={`plan ${plan === p.id ? 'plan--active' : ''} ${p.id === 'standard' ? 'plan--featured' : ''}`}
            onClick={() => setPlan(p.id)}
            aria-pressed={plan === p.id}
          >
            {p.id === 'standard' && <div className="plan__flag">Most Popular</div>}
            <h3>{p.name}</h3>
            <div className="plan__price">
              {formatPrice(p.priceCents)}
              <span className="muted small">/month</span>
            </div>
            <ul>
              {p.perks.map((perk) => (
                <li key={perk}>✓ {perk}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <h2 className="step">2. How long?</h2>
      <div className="segmented">
        {DURATIONS.map((d) => (
          <button
            key={d.months}
            className={`segmented__opt ${months === d.months ? 'segmented__opt--on' : ''}`}
            onClick={() => setMonths(d.months)}
            aria-pressed={months === d.months}
          >
            <strong>{d.label}</strong>
            <span>{formatPrice(priceFor(selectedPlan, d.months))}</span>
            {d.discountPct > 0 && <em>Save {d.discountPct}%</em>}
          </button>
        ))}
      </div>

      <h2 className="step">3. Pay with</h2>
      {billing.providers.length === 0 ? (
        <div className="notice">Payments aren't set up yet. Please check back soon.</div>
      ) : (
        <div className="providers">
          {billing.providers.map((p) => (
            <button
              key={p.id}
              className={`provider ${provider === p.id ? 'provider--on' : ''}`}
              onClick={() => setProvider(p.id)}
              aria-pressed={provider === p.id}
            >
              <span className="provider__icon">{PROVIDER_ICONS[p.id]}</span>
              <span>
                <strong>{p.name}</strong>
                <span className="muted small">{p.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="checkout-bar">
        <div>
          <div className="muted small">
            {selectedPlan.name} · {DURATIONS.find((d) => d.months === months)?.label}
          </div>
          <div className="checkout-bar__total">{formatPrice(total)}</div>
        </div>
        <button className="btn btn--red" disabled={busy || !provider} onClick={checkout}>
          {busy ? 'Starting checkout…' : 'Continue to payment'}
        </button>
      </div>
      {checkoutError && <div className="form__error">{checkoutError}</div>}
      <p className="muted small">
        Prices in USD. You'll pay the equivalent in your chosen coin at the current rate. Access starts as soon as the
        payment is confirmed on-chain.
      </p>
    </main>
  )
}
