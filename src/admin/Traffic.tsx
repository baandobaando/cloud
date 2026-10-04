import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ANALYTICS_RANGES, type AdminTraffic, type AnalyticsRange, type TrafficRow } from '../../shared/types'
import Icon from '../components/Icon'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'
import { BarList, Delta, SERIES, TimeChart } from './charts'
import { Kpi, PanelHead, RANGE_KEY, savedRange } from './Dashboard'
import { usePageTitle } from '../usePageTitle'

const num = (v: number) => Math.round(v).toLocaleString()
const numShort = (v: number) => (v >= 10_000 ? `${(v / 1000).toFixed(0)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
const DEVICES: Record<string, string> = { mobile: 'Phone', desktop: 'Computer', tablet: 'Tablet' }

/** "US" → 🇺🇸 (regional indicator letters). */
function flag(code: string) {
  return /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌐'
}
function countryName(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return 'Unknown'
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Who visits the site: visitors, page views, where they come from and what they look at. */
export default function Traffic() {
  usePageTitle('Admin · Traffic')
  const [range, setRange] = useState<AnalyticsRange>(savedRange)
  const { data: t, error, reload, loading } = useApi<AdminTraffic>(`/admin/traffic?range=${range}`)
  const choose = (r: AnalyticsRange) => {
    setRange(r)
    try {
      localStorage.setItem(RANGE_KEY, r)
    } catch {
      /* storage blocked */
    }
  }
  const meta = ANALYTICS_RANGES.find((r) => r.id === range)!

  return (
    <>
      <div className="admin__head dash__head">
        <div>
          <h1>Traffic</h1>
          <p className="muted small">
            Visitors to binge.tube, compared with the {range === '12m' ? 'previous 12 months' : `previous ${meta.days} days`}. Counted without
            cookies; a visitor is unique per day.
          </p>
        </div>
        <div className="dash__controls">
          <div className="seg" role="tablist" aria-label="Date range">
            {ANALYTICS_RANGES.map((r) => (
              <button key={r.id} role="tab" aria-selected={r.id === range} className={r.id === range ? 'seg--on' : ''} onClick={() => choose(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <button className="icon-btn icon-btn--ghost dash__refresh" onClick={reload} aria-label="Refresh" disabled={loading}>
            <Icon name="refresh" size={17} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {!t && !error && <Spinner />}
      {t && t.range === range && <TrafficBody t={t} />}
    </>
  )
}

function TrafficBody({ t }: { t: AdminTraffic }) {
  const k = t.kpis
  const rows = (list: TrafficRow[], label: (r: TrafficRow) => React.ReactNode = (r) => r.label) =>
    list.map((r) => ({ key: r.id ?? r.label, label: label(r), value: r.visitors, sub: `${num(r.views)} views` }))
  const funnel = [
    { label: 'Visitors', value: k.visitors.value },
    { label: 'Signed up', value: k.signups.value },
    { label: 'Started a subscription', value: k.subscribed.value },
  ]
  const top = Math.max(1, funnel[0].value)

  return (
    <div className="dash">
      <div className="kpis">
        <div className="kpi kpi--accent">
          <div className="kpi__label">
            <span className="live-dot" aria-hidden /> On the site now
          </div>
          <div className="kpi__value">{num(t.liveNow)}</div>
          <div className="kpi__foot">
            <span className="muted">visitors in the last 5 minutes</span>
          </div>
        </div>
        <Kpi label="Visitors" metric={k.visitors} format={num} />
        <Kpi label="Page views" metric={k.pageviews} format={num} />
        <div className="kpi">
          <div className="kpi__label">Pages per visit</div>
          <div className="kpi__value">{k.viewsPerVisitor.value.toFixed(1)}</div>
          <div className="kpi__foot">
            <Delta value={k.viewsPerVisitor.value} previous={k.viewsPerVisitor.previous} />
            <span className="muted">vs {k.viewsPerVisitor.previous.toFixed(1)}</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Sign-ups</div>
          <div className="kpi__value">{num(k.signups.value)}</div>
          <div className="kpi__foot">
            <Delta value={k.signups.value} previous={k.signups.previous} />
            <span className="muted">vs {num(k.signups.previous)}</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Visitor → sign-up</div>
          <div className="kpi__value">{k.signupRate.value.toFixed(1)}%</div>
          <div className="kpi__foot">
            <Delta value={k.signupRate.value} previous={k.signupRate.previous} points />
            <span className="muted">of visitors created an account</span>
          </div>
        </div>
      </div>

      <div className="dash__row dash__row--wide">
        <section className="panel">
          <PanelHead title="Visitors and page views" sub="Per day" value={num(k.visitors.value)} delta={<Delta value={k.visitors.value} previous={k.visitors.previous} />} />
          <TimeChart
            buckets={t.buckets}
            bucketMs={t.bucketMs}
            series={[
              { name: 'Visitors', data: k.visitors.series, color: SERIES[0] },
              { name: 'Page views', data: k.pageviews.series, color: SERIES[1] },
            ]}
            format={num}
            axisFormat={numShort}
          />
        </section>
        <section className="panel">
          <PanelHead title="Visitor funnel" sub="From landing on the site to subscribing" />
          <ol className="tfunnel">
            {funnel.map((f, i) => (
              <li key={f.label}>
                <div className="tfunnel__row">
                  <span>{f.label}</span>
                  <strong>{num(f.value)}</strong>
                </div>
                <div className="tfunnel__bar">
                  <span style={{ width: `${Math.max(2, (f.value / top) * 100)}%` }} />
                </div>
                {i > 0 && <span className="muted small">{funnel[i - 1].value ? ((f.value / funnel[i - 1].value) * 100).toFixed(1) : '0'}% of the step before</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="dash__row dash__row--three">
        <section className="panel">
          <PanelHead title="Most visited" sub="Sections of the site" />
          {t.topPages.length ? <BarList rows={rows(t.topPages)} format={num} /> : <p className="muted small">No visits yet.</p>}
        </section>
        <section className="panel">
          <PanelHead title="Top shows" sub="Show pages and the player" />
          {t.topSeries.length ? (
            <BarList rows={rows(t.topSeries, (r) => <Link to={`/admin/series/${r.id}`}>{r.label}</Link>)} format={num} />
          ) : (
            <p className="muted small">No show visits yet.</p>
          )}
        </section>
        <section className="panel">
          <PanelHead title="Where visitors come from" sub="The site that linked to binge.tube" />
          {t.referrers.length ? <BarList rows={rows(t.referrers)} format={num} color={SERIES[1]} /> : <p className="muted small">No visits yet.</p>}
        </section>
      </div>

      <div className="dash__row">
        <section className="panel">
          <PanelHead title="Countries" />
          {t.countries.length ? (
            <BarList rows={rows(t.countries, (r) => `${flag(r.label)} ${countryName(r.label)}`)} format={num} />
          ) : (
            <p className="muted small">No visits yet.</p>
          )}
        </section>
        <section className="panel">
          <PanelHead title="Devices" sub={`${num(t.signedIn.value)} signed-in members visited in this period`} />
          {t.devices.length ? <BarList rows={rows(t.devices, (r) => DEVICES[r.label] ?? r.label)} format={num} color={SERIES[1]} /> : <p className="muted small">No visits yet.</p>}
        </section>
      </div>
    </div>
  )
}
