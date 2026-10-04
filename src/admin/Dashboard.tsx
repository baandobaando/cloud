import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ANALYTICS_RANGES, type AdminAnalytics, type AnalyticsRange, type Metric } from '../../shared/types'
import Icon from '../components/Icon'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'
import { BarList, Delta, SERIES, Sparkline, TimeChart } from './charts'
import { usePageTitle } from '../usePageTitle'

export const RANGE_KEY = 'bingetube:admin-range'

const money = (cents: number) =>
  (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: cents >= 100_000 ? 0 : 2 })
const moneyShort = (cents: number) => {
  const d = cents / 100
  return d >= 10_000 ? `$${(d / 1000).toFixed(0)}k` : d >= 1000 ? `$${(d / 1000).toFixed(1)}k` : `$${Math.round(d)}`
}
const num = (v: number) => Math.round(v).toLocaleString()
const numShort = (v: number) => (v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)

export function savedRange(): AnalyticsRange {
  try {
    const v = localStorage.getItem(RANGE_KEY)
    if (ANALYTICS_RANGES.some((r) => r.id === v)) return v as AnalyticsRange
  } catch {
    /* storage blocked */
  }
  return '30d'
}

export default function Dashboard() {
  usePageTitle('Admin · Dashboard')
  const [range, setRange] = useState<AnalyticsRange>(savedRange)
  const { data: a, error, reload } = useApi<AdminAnalytics>(`/admin/analytics?range=${range}`)
  const choose = (r: AnalyticsRange) => {
    setRange(r)
    try {
      localStorage.setItem(RANGE_KEY, r)
    } catch {
      /* storage blocked */
    }
  }
  const meta = ANALYTICS_RANGES.find((r) => r.id === range)!
  const period = range === '12m' ? 'previous 12 months' : `previous ${meta.days} days`

  return (
    <>
      <div className="admin__head dash__head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted small">Compared with the {period}</p>
        </div>
        <div className="dash__controls">
          <div className="seg" role="tablist" aria-label="Date range">
            {ANALYTICS_RANGES.map((r) => (
              <button key={r.id} role="tab" aria-selected={r.id === range} className={r.id === range ? 'seg--on' : ''} onClick={() => choose(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <button className="icon-btn icon-btn--ghost dash__refresh" onClick={reload} aria-label="Refresh">
            <Icon name="refresh" size={17} />
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {!a && !error && <Spinner />}
      {a && a.range === range && <DashboardBody a={a} />}
    </>
  )
}

function DashboardBody({ a }: { a: AdminAnalytics }) {
  const k = a.kpis
  const funnelTop = Math.max(1, a.funnel[0]?.value ?? 1)

  return (
    <div className="dash">
      <div className="kpis">
        <Kpi label="Revenue" metric={k.revenueCents} format={money} accent />
        <Kpi label="New members" metric={k.newMembers} format={num} />
        <Kpi label="Signups" metric={k.signups} format={num} />
        <div className="kpi">
          <div className="kpi__label">Conversion</div>
          <div className="kpi__value">{k.conversion.value.toFixed(1)}%</div>
          <div className="kpi__foot">
            <Delta value={k.conversion.value} previous={k.conversion.previous} points />
            <span className="muted">signups → members</span>
          </div>
        </div>
        <Kpi label="Episode views" metric={k.views} format={num} />
        <Kpi label="Active viewers" metric={k.activeViewers} format={num} />
        <div className="kpi">
          <div className="kpi__label">Active members</div>
          <div className="kpi__value">{num(a.totals.activeMembers)}</div>
          <div className="kpi__foot">
            <span className="muted">{money(a.totals.mrrCents)} monthly run-rate</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Passes expired</div>
          <div className="kpi__value">{num(k.expired.value)}</div>
          <div className="kpi__foot">
            <Delta value={k.expired.value} previous={k.expired.previous} invert />
            <span className="muted">{a.expiringSoon.length} ending this week</span>
          </div>
        </div>
      </div>

      <div className="dash__row dash__row--wide">
        <section className="panel">
          <PanelHead title="Revenue" value={money(k.revenueCents.value)} delta={<Delta value={k.revenueCents.value} previous={k.revenueCents.previous} />} />
          <TimeChart buckets={a.buckets} bucketMs={a.bucketMs} series={[{ name: 'Revenue', data: k.revenueCents.series }]} format={money} axisFormat={moneyShort} />
        </section>
        <section className="panel">
          <PanelHead title="Conversion funnel" sub="People who signed up in this period" />
          <div className="funnel">
            {a.funnel.map((step, i) => {
              const prev = i ? a.funnel[i - 1].value : step.value
              return (
                <div key={step.label} className="funnel__step">
                  <div className="funnel__top">
                    <span>{step.label}</span>
                    <strong>{num(step.value)}</strong>
                  </div>
                  <div className="funnel__track">
                    <div style={{ width: `${(step.value / funnelTop) * 100}%` }} />
                  </div>
                  <div className="funnel__rate muted">
                    {i === 0 ? '100% of signups' : `${prev ? Math.round((step.value / prev) * 100) : 0}% of previous step · ${Math.round((step.value / funnelTop) * 100)}% overall`}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div className="dash__row">
        <section className="panel">
          <PanelHead title="Signups & new members" />
          <TimeChart
            buckets={a.buckets}
            bucketMs={a.bucketMs}
            series={[
              { name: 'Signups', data: k.signups.series },
              { name: 'New members', data: k.newMembers.series },
            ]}
            format={num}
            axisFormat={numShort}
            height={220}
          />
        </section>
        <section className="panel">
          <PanelHead title="Episode views" value={num(k.views.value)} delta={<Delta value={k.views.value} previous={k.views.previous} />} />
          <TimeChart buckets={a.buckets} bucketMs={a.bucketMs} series={[{ name: 'Views', data: k.views.series }]} format={num} axisFormat={numShort} kind="bar" height={220} />
        </section>
      </div>

      <div className="dash__row dash__row--three">
        <section className="panel">
          <PanelHead title="Passes sold" sub="Revenue by pass length" />
          <BarList
            rows={a.passes.map((p) => ({ key: String(p.months), label: `${p.months} month${p.months > 1 ? 's' : ''}`, value: p.revenueCents, sub: `${num(p.count)} sold` }))}
            format={money}
          />
        </section>
        <section className="panel">
          <PanelHead title="Paid with" sub="Revenue by coin" />
          <BarList rows={a.currencies.slice(0, 6).map((c) => ({ key: c.currency, label: c.currency, value: c.revenueCents, sub: `${num(c.count)} payments` }))} format={money} color={SERIES[1]} />
        </section>
        <section className="panel">
          <PanelHead title="Most watched" sub="Episode views this period" />
          {a.topSeries.length === 0 ? (
            <p className="muted small">No views yet in this period.</p>
          ) : (
            <ol className="toplist">
              {a.topSeries.map((t, i) => (
                <li key={t.id}>
                  <span className="toplist__rank">{i + 1}</span>
                  <Link to={`/admin/series/${t.id}`} className="toplist__title">
                    {t.title}
                  </Link>
                  <span className="toplist__num">
                    {num(t.views)}
                    <em>{num(t.viewers)} viewers</em>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="dash__row dash__row--wide">
        <section className="panel">
          <div className="admin__head">
            <h2>Recent payments</h2>
            <Link to="/admin/orders" className="link small">
              All orders
            </Link>
          </div>
          {a.recentPayments.length === 0 ? (
            <p className="muted">No payments yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Via</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {a.recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td>{p.email}</td>
                    <td>{p.provider === 'test' ? <span className="tag">test</span> : p.provider}</td>
                    <td className="num">{money(p.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <PanelHead title="Ending this week" sub="Members whose pass runs out in 7 days" />
          {a.expiringSoon.length === 0 ? (
            <p className="muted small">Nobody's pass ends this week.</p>
          ) : (
            <ul className="expiring">
              {a.expiringSoon.map((e) => (
                <li key={e.email + e.endsAt}>
                  <span>{e.email}</span>
                  <span className="muted">{daysLeft(e.endsAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small dash__catalog">
            Catalog: {num(a.totals.seriesPublished)} live series · {num(a.totals.episodes)} episodes · {num(a.totals.users)} users
          </p>
        </section>
      </div>
    </div>
  )
}

function daysLeft(t: number) {
  const d = Math.ceil((t - Date.now()) / 86_400_000)
  return d <= 1 ? 'today' : `in ${d} days`
}

export function Kpi({ label, metric, format, accent }: { label: string; metric: Metric; format: (v: number) => string; accent?: boolean }) {
  return (
    <div className={`kpi ${accent ? 'kpi--accent' : ''}`}>
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{format(metric.value)}</div>
      <div className="kpi__foot">
        <Delta value={metric.value} previous={metric.previous} />
        <span className="muted">vs {format(metric.previous)}</span>
      </div>
      <Sparkline data={metric.series} />
    </div>
  )
}

export function PanelHead({ title, sub, value, delta }: { title: string; sub?: string; value?: string; delta?: ReactNode }) {
  return (
    <header className="panel__head">
      <div>
        <h2>{title}</h2>
        {sub && <p className="muted small">{sub}</p>}
      </div>
      {value && (
        <div className="panel__figure">
          <strong>{value}</strong>
          {delta}
        </div>
      )}
    </header>
  )
}
