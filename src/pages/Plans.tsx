import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DURATIONS, MEMBERSHIP, formatPrice, priceFor, type BillingConfig, type PaymentProviderId } from '../../shared/types'
import { api, errorMessage } from '../api'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'
import Icon, { type IconName } from '../components/Icon'

const PROVIDER_ICONS: Record<PaymentProviderId, IconName> = { nowpayments: 'coins', btcpay: 'bitcoin', test: 'check' }

export default function Plans() {
  const { me } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: billing, error, reload } = useApi<BillingConfig>('/billing/config')
  const [months, setMonths] = useState<number>(3)
  const [provider, setProvider] = useState<PaymentProviderId | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    if (billing && !provider && billing.providers[0]) setProvider(billing.providers[0].id)
  }, [billing, provider])

  if (error) return <main className="page"><ErrorState message={error} onRetry={reload} /></main>
  if (!billing) return <Spinner fullscreen />

  const total = priceFor(MEMBERSHIP, months)
  const sub = me?.subscription
  const activeUntil = sub?.currentPeriodEnd && sub.currentPeriodEnd > Date.now() ? sub.currentPeriodEnd : null

  const checkout = async () => {
    if (!provider) return
    setBusy(true)
    setCheckoutError(null)
    try {
      const returnTo = params.get('return')
      try {
        if (returnTo?.startsWith('/')) sessionStorage.setItem('reelflix:return', returnTo)
      } catch {
        /* storage unavailable: buyers just land on Home after paying */
      }
      const { checkoutUrl } = await api.post<{ orderId: string; checkoutUrl: string }>('/billing/orders', { months, provider })
      if (checkoutUrl.startsWith('/')) navigate(checkoutUrl)
      else window.location.assign(checkoutUrl)
    } catch (err) {
      setCheckoutError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="page page--checkout">
      <header className="checkout__intro">
        <span className="eyebrow">ReelFlix membership</span>
        <h1>{me?.isEntitled ? 'Add more time' : 'Every episode. One price.'}</h1>
        <p className="muted">
          {activeUntil
            ? `You're a member until ${new Date(activeUntil).toLocaleDateString(undefined, { dateStyle: 'medium' })}. New time is added on top.`
            : `${formatPrice(MEMBERSHIP.priceCents)} a month, paid in crypto. Nothing renews automatically.`}
        </p>
        <ul className="perks">
          {MEMBERSHIP.perks.map((perk) => (
            <li key={perk}>
              <Icon name="check" size={16} />
              {perk}
            </li>
          ))}
        </ul>
      </header>

      <section className="checkout__box">
        <h2 className="step">How long?</h2>
        <div className="options" role="radiogroup" aria-label="Pass length">
          {DURATIONS.map((d) => {
            const price = priceFor(MEMBERSHIP, d.months)
            return (
              <button
                key={d.months}
                role="radio"
                aria-checked={months === d.months}
                className={`option ${months === d.months ? 'option--on' : ''}`}
                onClick={() => setMonths(d.months)}
              >
                <span className="option__label">{d.label}</span>
                <span className="option__price">{formatPrice(price)}</span>
                <span className="option__note">
                  {d.months === 1 ? 'Try it out' : `${formatPrice(Math.round(price / d.months))}/mo`}
                </span>
                {d.discountPct > 0 && <span className="option__save">Save {d.discountPct}%</span>}
              </button>
            )
          })}
        </div>

        <h2 className="step">Pay with</h2>
        {billing.providers.length === 0 ? (
          <div className="notice">Payments aren't set up yet. Please check back soon.</div>
        ) : (
          <div className="options options--stack" role="radiogroup" aria-label="Payment method">
            {billing.providers.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={provider === p.id}
                className={`option option--row ${provider === p.id ? 'option--on' : ''}`}
                onClick={() => setProvider(p.id)}
              >
                <span className="option__icon">
                  <Icon name={PROVIDER_ICONS[p.id]} />
                </span>
                <span className="option__text">
                  <strong>{p.name}</strong>
                  <span className="muted small">{p.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="checkout__total">
          <div>
            <span className="muted small">Total today</span>
            <strong>{formatPrice(total)}</strong>
          </div>
          {me ? (
            <button className="btn btn--accent btn--lg" disabled={busy || !provider} onClick={checkout}>
              {busy ? 'Starting checkout…' : 'Continue to payment'}
            </button>
          ) : (
            <button className="btn btn--accent btn--lg" onClick={() => navigate('/signup?next=/plans')}>
              Create account to continue
            </button>
          )}
        </div>
        {checkoutError && <div className="form__error">{checkoutError}</div>}
        <p className="muted small">
          Priced in USD. You pay the equivalent in your chosen coin at the current rate, and access starts once the
          payment confirms on-chain.
        </p>
      </section>
    </main>
  )
}
