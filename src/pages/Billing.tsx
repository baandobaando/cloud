import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatPrice, type OrderView } from '../../shared/types'
import Icon from '../components/Icon'
import { api, errorMessage } from '../api'
import { useSession } from '../state/Session'
import { ErrorState, Spinner } from '../components/Feedback'


function takeReturnPath(): string {
  try {
    const v = sessionStorage.getItem('reelflix:return')
    sessionStorage.removeItem('reelflix:return')
    return v && v.startsWith('/') && !v.startsWith('//') ? v : '/'
  } catch {
    return '/'
  }
}

/** Where buyers land after paying. Polls until the payment is confirmed. */
export function OrderStatusPage() {
  const { orderId = '' } = useParams()
  const { refreshMe } = useSession()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const o = await api.get<OrderView>(`/billing/orders/${encodeURIComponent(orderId)}`)
        if (cancelled) return
        setOrder(o)
        setError(null)
        if (o.status === 'paid') {
          refreshMe()
          return
        }
        if (o.status === 'expired' || o.status === 'failed') return
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      }
      timer = setTimeout(poll, 5000)
    }
    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [orderId, refreshMe])

  if (error && !order) return <main className="page"><ErrorState message={error} /></main>
  if (!order) return <Spinner fullscreen />

  const summary = `Membership · ${order.months} month${order.months > 1 ? 's' : ''} · ${formatPrice(order.amountCents)}`

  return (
    <main className="page page--center">
      <div className="status-card">
        {order.status === 'paid' ? (
          <>
            <div className="status-card__icon status-card__icon--ok"><Icon name="check" size={30} /></div>
            <h1>You're in!</h1>
            <p className="muted">{summary}</p>
            <p>Payment confirmed. Every episode of every series is now unlocked.</p>
            <button className="btn btn--accent btn--block" onClick={() => navigate(takeReturnPath())}>
              Start Watching
            </button>
          </>
        ) : order.status === 'expired' || order.status === 'failed' ? (
          <>
            <div className="status-card__icon status-card__icon--bad">!</div>
            <h1>{order.status === 'expired' ? 'Payment window expired' : 'Payment failed'}</h1>
            <p className="muted">{summary}</p>
            <p>
              No access was granted. If you already sent funds, they're still being tracked. Contact support with
              order <code>{order.id.slice(0, 8)}</code>.
            </p>
            <Link to="/plans" className="btn btn--accent btn--block">
              Try Again
            </Link>
          </>
        ) : (
          <>
            <div className="spinner" />
            <h1>{order.status === 'confirming' ? 'Confirming on the blockchain…' : 'Waiting for your payment…'}</h1>
            <p className="muted">{summary}</p>
            <p>
              {order.status === 'confirming'
                ? 'We see your payment. This usually takes a few minutes, depending on the coin.'
                : "Finish paying in the checkout window. This page updates automatically. You can close it and come back anytime."}
            </p>
            {order.checkoutUrl && order.status === 'pending' && (
              order.checkoutUrl.startsWith('/') ? (
                <Link to={order.checkoutUrl} className="btn btn--secondary btn--block">Open checkout</Link>
              ) : (
                <a href={order.checkoutUrl} className="btn btn--secondary btn--block" rel="noopener noreferrer">
                  Open checkout
                </a>
              )
            )}
          </>
        )}
      </div>
    </main>
  )
}

/** Development-only stand-in for a crypto processor's hosted checkout page. */
export function TestCheckout() {
  const { orderId = '' } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [coin, setCoin] = useState('BTC')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<OrderView>(`/billing/orders/${encodeURIComponent(orderId)}`).then(setOrder, (e) => setError(errorMessage(e)))
  }, [orderId])

  if (error) return <main className="page"><ErrorState message={error} /></main>
  if (!order) return <Spinner fullscreen />

  const pay = async () => {
    setBusy(true)
    try {
      await api.post(`/billing/test/${encodeURIComponent(orderId)}/pay`)
      navigate(`/billing/order/${orderId}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <main className="test-checkout">
      <div className="test-checkout__card">
        <div className="test-checkout__warn">TEST MODE: no real payment</div>
        <div className="muted small">BingeTube membership · {order.months} mo</div>
        <div className="test-checkout__amount">{formatPrice(order.amountCents)}</div>
        <label className="muted small" htmlFor="coin">
          Pay with
        </label>
        <select id="coin" value={coin} onChange={(e) => setCoin(e.target.value)}>
          {['BTC', 'BTC ⚡ Lightning', 'ETH', 'USDT (TRC20)', 'USDC (Solana)', 'LTC'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <div className="test-checkout__qr" aria-hidden>
          {Array.from({ length: 64 }, (_, i) => (
            <span key={i} style={{ opacity: (i * 7919) % 3 ? 1 : 0 }} />
          ))}
        </div>
        <code className="test-checkout__addr">bc1qtest{orderId.replace(/-/g, '').slice(0, 30)}</code>
        <button className="btn btn--accent btn--block" disabled={busy || order.status === 'paid'} onClick={pay}>
          {busy ? 'Confirming…' : order.status === 'paid' ? 'Already paid' : 'Simulate successful payment'}
        </button>
        <Link to={`/billing/order/${orderId}`} className="btn btn--link">
          Cancel
        </Link>
      </div>
    </main>
  )
}
