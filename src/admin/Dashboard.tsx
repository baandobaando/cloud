import { Link } from 'react-router-dom'
import { DURATIONS, formatPrice, type AdminStats } from '../../shared/types'
import Icon from '../components/Icon'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'

export default function Dashboard() {
  const { data: s, error, reload } = useApi<AdminStats>('/admin/stats')
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!s) return <Spinner />

  const maxPasses = Math.max(1, ...Object.values(s.passesByLength))

  return (
    <>
      <div className="admin__head">
        <h1>Dashboard</h1>
        <button className="btn btn--secondary btn--small" onClick={reload}><Icon name="refresh" size={16} /> Refresh</button>
      </div>
      <div className="stats">
        <Stat label="Active members" value={s.activeSubscribers.toLocaleString()} />
        <Stat label="Monthly run-rate" value={formatPrice(s.mrrCents)} hint="Active members × $9.99" />
        <Stat label="Revenue, last 30 days" value={formatPrice(s.revenue30dCents)} hint="Confirmed crypto payments" />
        <Stat label="Users" value={s.users.toLocaleString()} hint={`+${s.newUsers7d} this week`} />
        <Stat label="Conversion" value={s.users ? `${Math.round((s.activeSubscribers / s.users) * 100)}%` : '—'} hint="Users who are members" />
        <Stat label="Catalog" value={`${s.seriesPublished} live`} hint={`${s.seriesDraft} drafts · ${s.episodes.toLocaleString()} episodes`} />
      </div>

      <div className="admin__grid">
        <section className="panel">
          <h2>Passes sold by length</h2>
          {DURATIONS.map((d) => (
            <div key={d.months} className="bar-row">
              <span>{d.label}</span>
              <div className="bar">
                <div style={{ width: `${((s.passesByLength[d.months] ?? 0) / maxPasses) * 100}%` }} />
              </div>
              <strong>{s.passesByLength[d.months] ?? 0}</strong>
            </div>
          ))}
        </section>

        <section className="panel">
          <h2>Most watched</h2>
          <ol className="rank-list">
            {s.topSeries.map((t) => (
              <li key={t.id}>
                <Link to={`/admin/series/${t.id}`}>{t.title}</Link>
                <span className="muted">{t.viewers} viewer{t.viewers === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="panel">
        <div className="admin__head">
          <h2>Recent payments</h2>
          <Link to="/admin/orders" className="link small">All orders</Link>
        </div>
        {s.recentPayments.length === 0 ? (
          <p className="muted">No payments yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>When</th><th>User</th><th>Via</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {s.recentPayments.map((p) => (
                <tr key={p.id}>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                  <td>{p.email}</td>
                  <td>{p.provider === 'test' ? <span className="tag">test</span> : p.provider}</td>
                  <td className="num">{formatPrice(p.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  )
}
