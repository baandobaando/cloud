import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DURATIONS, MEMBERSHIP, TRIAL_DAYS, formatPrice, priceFor, type BillingConfig, type PaymentProviderId } from '../../shared/types'
import { api, errorMessage } from '../api'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'
import Icon, { type IconName } from '../components/Icon'
import { usePageTitle } from '../usePageTitle'

const PROVIDER_ICONS: Record<PaymentProviderId, IconName> = { stripe: 'card', btcpay: 'bitcoin', test: 'check' }

export default function Plans() {
  usePageTitle('Membership')
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
  if (billing.subscription) return <SubscriptionPlan />

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
        <span className="eyebrow">BingeTube membership</span>
        <h1>{me?.isEntitled ? 'Add more time' : 'Every episode. One price.'}</h1>
        <p className="muted">
          {activeUntil
            ? `You're a member until ${new Date(activeUntil).toLocaleDateString(undefined, { dateStyle: 'medium' })}. New time is added on top.`
            : `${formatPrice(MEMBERSHIP.priceCents)} a month. Prepaid, so nothing renews automatically.`}
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
            <button className="btn btn--accent btn--lg" onClick={() => navigate(`/signup?next=${encodeURIComponent(`/plans${params.toString() ? `?${params}` : ''}`)}`)}>
              Create account to continue
            </button>
          )}
        </div>
        {checkoutError && <div className="form__error">{checkoutError}</div>}
        <p className="muted small">
          Priced in USD. You'll finish paying on a secure Stripe page, and access starts as soon as the payment goes
          through.
        </p>
      </section>
    </main>
  )
}

/** Monthly membership through Stripe: a free trial for new accounts, then billed every month until cancelled. */
function SubscriptionPlan() {
  const { me } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const sub = me?.subscription
  const subscribed = !!(sub?.renews || sub?.cancelAtPeriodEnd)
  // Visitors who aren't signed in haven't used a trial yet either.
  const trial = !me || !!me.trialEligible
  const price = formatPrice(MEMBERSHIP.priceCents)
  const firstCharge = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

  const start = async () => {
    if (!me) {
      navigate(`/signup?next=${encodeURIComponent(`/plans${params.toString() ? `?${params}` : ''}`)}`)
      return
    }
    setBusy(true)
    setCheckoutError(null)
    try {
      const returnTo = params.get('return')
      try {
        if (returnTo?.startsWith('/')) sessionStorage.setItem('reelflix:return', returnTo)
      } catch {
        /* storage unavailable: members just land on Home after paying */
      }
      const { checkoutUrl } = await api.post<{ orderId: string; checkoutUrl: string }>('/billing/subscription', {})
      window.location.assign(checkoutUrl)
    } catch (err) {
      setCheckoutError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="page page--checkout">
      <header className="checkout__intro">
        <span className="eyebrow">BingeTube membership</span>
        <h1>{trial ? `Watch everything free for ${TRIAL_DAYS} days` : 'Every episode. One price.'}</h1>
        <p className="muted">
          {trial
            ? `Then ${price} a month. Cancel anytime before ${firstCharge} and you won't be charged.`
            : `${price} a month. Cancel anytime.`}
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

      <section className="checkout__box sub-plan">
        {subscribed ? (
          <div className="notice">
            You're already a member{sub?.cancelAtPeriodEnd ? ' (cancelled, access until the end of your current month)' : ''}. You can manage your
            subscription from your <a href="/account">account page</a>.
          </div>
        ) : (
          <>
            <div className="sub-plan__card">
              {trial && <span className="sub-plan__badge">{TRIAL_DAYS} days free</span>}
              <div className="sub-plan__price">
                <strong>{trial ? '$0' : price}</strong>
                <span>{trial ? 'today' : '/ month'}</span>
              </div>
              <p className="muted small">
                {trial ? `${price}/month after your free trial. ` : ''}Renews monthly. Cancel anytime in your account, in two clicks.
              </p>
              {trial && (
                <ol className="sub-plan__steps">
                  <li>
                    <strong>Today</strong> Every episode unlocks
                  </li>
                  <li>
                    <strong>Anytime</strong> Cancel from your account page in two clicks
                  </li>
                  <li>
                    <strong>{firstCharge}</strong> {price}/month starts, unless you cancel
                  </li>
                </ol>
              )}
            </div>
            <button className="btn btn--accent btn--lg btn--block" disabled={busy} onClick={start}>
              {busy ? 'Starting checkout…' : trial ? 'Start my free trial' : `Subscribe for ${price}/month`}
            </button>
            {checkoutError && <div className="form__error">{checkoutError}</div>}
            <p className="muted small sub-plan__fine">
              Secure checkout by Stripe: card, Apple Pay or Google Pay.{trial ? ' A card is needed to start the trial; nothing is charged today. We check the card with a temporary $1 hold that’s released right away.' : ''}
            </p>
          </>
        )}
      </section>
    </main>
  )
}
