import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatPrice, type OrderView } from '../../shared/types'
import { IS_DEMO, api, errorMessage } from '../api'
import { ResetDemoButton } from '../demo/DemoHints'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import { useToast } from '../components/Toast'

const STATUS_LABEL: Record<OrderView['status'], string> = {
  pending: 'Awaiting payment',
  confirming: 'Confirming',
  paid: 'Paid',
  expired: 'Expired',
  failed: 'Failed',
}

export default function Account() {
  const { me, logout, selectProfile } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: orders } = useApi<OrderView[]>('/billing/orders')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  if (!me) return null
  const sub = me.subscription
  const ended = sub?.currentPeriodEnd !== null && sub?.currentPeriodEnd !== undefined && sub.currentPeriodEnd < Date.now()

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/auth/password', { currentPassword: current, newPassword: next })
      toast('Password updated. Other devices were signed out.', 'success')
      setCurrent('')
      setNext('')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page page--narrow">
      <h1 className="page__heading">Account</h1>

      <section className="panel">
        <h2>Membership</h2>
        {sub && !ended ? (
          <>
            <p className="panel__big">
              Member <span className="tag">{sub.source === 'comp' ? 'Complimentary' : sub.source === 'test' ? 'Test' : 'Crypto pass'}</span>
            </p>
            <p className="muted">
              {sub.currentPeriodEnd === null
                ? 'Access does not expire.'
                : `Access until ${new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'long' })}. Passes don't renew automatically.`}
            </p>
            <Link to="/plans" className="btn btn--primary">
              Add more time
            </Link>
          </>
        ) : (
          <>
            <p className="muted">{ended ? 'Your membership has ended.' : "You're not a member yet."} Free episodes are still available.</p>
            <Link to="/plans" className="btn btn--accent">
              {ended ? 'Renew membership' : 'Become a member'}
            </Link>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Payment history</h2>
        {!orders ? (
          <p className="muted">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="muted">No payments yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pass</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td>
                    {o.months} month{o.months > 1 ? 's' : ''}
                  </td>
                  <td>{formatPrice(o.amountCents)}</td>
                  <td>
                    {o.status === 'pending' || o.status === 'confirming' ? (
                      <Link to={`/billing/order/${o.id}`} className="link">
                        {STATUS_LABEL[o.status]}
                      </Link>
                    ) : (
                      <span className={`status status--${o.status}`}>{STATUS_LABEL[o.status]}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Sign-in details</h2>
        <p className="muted">{me.email}</p>
        <form className="form form--inline" onSubmit={changePassword}>
          <input type="password" autoComplete="current-password" placeholder="Current password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          <input type="password" autoComplete="new-password" placeholder="New password (8+)" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          <button className="btn btn--secondary" disabled={busy}>
            Change password
          </button>
        </form>
      </section>

      <section className="panel panel--row">
        <button className="btn btn--secondary" onClick={() => { selectProfile(null); navigate('/') }}>
          Manage profiles
        </button>
        <button className="btn btn--glass" onClick={() => logout().then(() => navigate('/'))}>
          Sign out
        </button>
        {IS_DEMO && <ResetDemoButton />}
      </section>
    </main>
  )
}
