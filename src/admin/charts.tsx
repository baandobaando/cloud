import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/** Chart colors: validated for the dark admin surface (blue, then orange for a second series). */
export const SERIES = ['#3987e5', '#d95926'] as const

export interface Series {
  name: string
  data: number[]
  color?: string
}

/** Width of an element, kept in sync with resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Round axis maximum and evenly spaced ticks (1, 2, 2.5, 5 × 10^n). */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

export function formatBucket(t: number, bucketMs: number, long = false) {
  const d = new Date(t)
  if (bucketMs >= 20 * 86_400_000) return d.toLocaleDateString(undefined, { month: 'short', year: long ? 'numeric' : '2-digit' })
  if (bucketMs > 86_400_000 * 1.5) {
    const e = new Date(t + bucketMs - 1)
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${long ? ` – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
  }
  return d.toLocaleDateString(undefined, long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })
}

const PAD = { top: 12, right: 12, bottom: 26, left: 48 }

interface TimeChartProps {
  buckets: number[]
  bucketMs: number
  series: Series[]
  format: (v: number) => string
  axisFormat?: (v: number) => string
  kind?: 'line' | 'bar'
  height?: number
}

/** Line/area or bar chart over time with a crosshair tooltip. One y-axis only. */
export function TimeChart({ buckets, bucketMs, series, format, axisFormat = format, kind = 'line', height = 240 }: TimeChartProps) {
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const gradId = useId()
  const n = buckets.length
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const ticks = niceTicks(Math.max(0, ...series.flatMap((s) => s.data)))
  const yMax = ticks[ticks.length - 1] || 1
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH
  const slot = n ? innerW / n : 0
  const x = (i: number) => PAD.left + (kind === 'bar' ? slot * i + slot / 2 : n > 1 ? (innerW * i) / (n - 1) : innerW / 2)
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 80))))

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = kind === 'bar' ? Math.floor(px / slot) : Math.round((px / innerW) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className="chart" ref={wrapRef}>
      {series.length > 1 && (
        <div className="chart__legend">
          {series.map((s, i) => (
            <span key={s.name}>
              <i style={{ background: s.color ?? SERIES[i] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.name).join(' and ')}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={series[0]?.color ?? SERIES[0]} stopOpacity="0.28" />
              <stop offset="1" stopColor={series[0]?.color ?? SERIES[0]} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart__grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart__axis" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {buckets.map((b, i) =>
            i % labelEvery === 0 ? (
              <text key={b} className="chart__axis" x={x(i)} y={height - 6} textAnchor="middle">
                {formatBucket(b, bucketMs)}
              </text>
            ) : null,
          )}

          {kind === 'bar'
            ? series[0]?.data.map((v, i) => {
                const w = Math.max(1, slot - 2)
                const h = Math.max(0, y(0) - y(v))
                const r = Math.min(4, w / 2, h)
                const x0 = PAD.left + slot * i + 1
                const top = y(v)
                return (
                  <path
                    key={i}
                    className={`chart__bar ${hover !== null && hover !== i ? 'chart__bar--dim' : ''}`}
                    fill={series[0].color ?? SERIES[0]}
                    d={`M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + w - r} Q${x0 + w},${top} ${x0 + w},${top + r} V${y(0)} Z`}
                  />
                )
              })
            : series.map((s, si) => {
                const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(' L')
                return (
                  <g key={s.name}>
                    {si === 0 && series.length === 1 && (
                      <path d={`M${x(0)},${y(0)} L${pts} L${x(n - 1)},${y(0)} Z`} fill={`url(#${gradId})`} />
                    )}
                    <path d={`M${pts}`} fill="none" stroke={s.color ?? SERIES[si]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  </g>
                )
              })}

          {hover !== null && kind === 'line' && (
            <g>
              <line className="chart__cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} />
              {series.map((s, si) => (
                <circle key={s.name} cx={x(hover)} cy={y(s.data[hover])} r="4.5" fill={s.color ?? SERIES[si]} stroke="var(--surface)" strokeWidth="2" />
              ))}
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="chart__tip"
          style={{ left: x(hover) + 186 > width ? x(hover) - 182 : x(hover) + 12, top: PAD.top + (series.length > 1 ? 28 : 4) }}
        >
          <div className="chart__tip-date">{formatBucket(buckets[hover], bucketMs, true)}</div>
          {series.map((s, si) => (
            <div key={s.name} className="chart__tip-row">
              <i style={{ background: s.color ?? SERIES[si] }} />
              <span>{s.name}</span>
              <strong>{format(s.data[hover])}</strong>
            </div>
          ))}
        </div>
      )}
      {/* Table view for screen readers. */}
      <table className="sr-only">
        <thead>
          <tr>
            <th>Period</th>
            {series.map((s) => (
              <th key={s.name}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b, i) => (
            <tr key={b}>
              <td>{formatBucket(b, bucketMs, true)}</td>
              {series.map((s) => (
                <td key={s.name}>{format(s.data[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Tiny trend line for KPI tiles. */
export function Sparkline({ data, color = SERIES[0] }: { data: number[]; color?: string }) {
  const id = useId()
  if (data.length < 2) return null
  const w = 120
  const h = 36
  const max = Math.max(...data) || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(' L')
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0,${h} L${pts} L${w},${h} Z`} fill={`url(#${id})`} />
      <path d={`M${pts}`} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/** Change vs the previous period: arrow + percentage, green when good, red when bad. */
export function Delta({ value, previous, points = false, invert = false }: { value: number; previous: number; points?: boolean; invert?: boolean }) {
  if (points) {
    const d = value - previous
    if (!previous && !value) return <span className="delta delta--flat">—</span>
    const good = invert ? d < 0 : d > 0
    return (
      <span className={`delta ${Math.abs(d) < 0.05 ? 'delta--flat' : good ? 'delta--up' : 'delta--down'}`}>
        {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)} pts
      </span>
    )
  }
  if (!previous) return <span className="delta delta--flat">{value ? 'New' : '—'}</span>
  const pct = ((value - previous) / previous) * 100
  const good = invert ? pct < 0 : pct > 0
  return (
    <span className={`delta ${Math.abs(pct) < 0.5 ? 'delta--flat' : good ? 'delta--up' : 'delta--down'}`}>
      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}%
    </span>
  )
}

/** Horizontal bars for breakdowns, labelled with value and share. */
export function BarList({ rows, format, color = SERIES[0] }: { rows: { label: ReactNode; value: number; key: string; sub?: string }[]; format: (v: number) => string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const total = rows.reduce((n, r) => n + r.value, 0)
  if (rows.length === 0) return <p className="muted small">No data for this period yet.</p>
  return (
    <div className="barlist">
      {rows.map((r) => (
        <div key={r.key} className="barlist__row" title={`${format(r.value)} · ${total ? Math.round((r.value / total) * 100) : 0}%`}>
          <div className="barlist__label">
            <span>{r.label}</span>
            <span className="barlist__value">
              {format(r.value)}
              <em>{total ? Math.round((r.value / total) * 100) : 0}%</em>
            </span>
          </div>
          <div className="barlist__track">
            <div style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
          {r.sub && <div className="barlist__sub">{r.sub}</div>}
        </div>
      ))}
    </div>
  )
}
