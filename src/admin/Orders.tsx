import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { AdminOrder, AdminOrderPage, OrderStatus } from '../../shared/types'
import Icon from '../components/Icon'
import { api, errorMessage } from '../api'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { useDialog } from '../components/Dialog'
import { Drawer, Kpi, Pager, dateTime, money, useDebounced } from './ui'
import { usePageTitle } from '../usePageTitle'

const STATUSES: { id: OrderStatus | ''; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirming', label: 'Confirming' },
  { id: 'expired', label: 'Expired' },
  { id: 'failed', label: 'Failed' },
]

const RANGES: { id: string; label: string; days: number | null }[] = [
  { id: '', label: 'All time', days: null },
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
]

function rangeStart(id: string): number {
  const r = RANGES.find((x) => x.id === id)
  if (!r || r.days === null) return 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime() - r.days * 86_400_000
}

const PROVIDERS: Record<string, string> = { nowpayments: 'NOWPayments', btcpay: 'BTCPay', test: 'Test' }

export default function Orders() {
  usePageTitle('Admin · Orders')
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const search = useDebounced(q)
  const status = params.get('status') ?? ''
  const provider = params.get('provider') ?? ''
  const range = params.get('range') ?? ''
  const page = Number(params.get('page')) || 1
  const [open, setOpen] = useState<AdminOrder | null>(null)

  const set = (patch: Record<string, string>) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
      if (!('page' in patch)) next.delete('page')
      return next
    })

  const from = rangeStart(range)
  const query = `status=${status}&provider=${provider}&q=${encodeURIComponent(search)}${from ? `&from=${from}` : ''}`
  const { data, error, loading, reload } = useApi<AdminOrderPage>(`/admin/orders?${query}&page=${page}`)

  if (error && !data) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <Spinner />
  const s = data.stats

  return (
    <div className="slist">
      <div className="admin__head slist__head">
        <div>
          <h1>Orders</h1>
          <p className="muted small">Every checkout started on BingeTube, with crypto processor status.</p>
        </div>
        <div className="admin__actions">
          <a className="btn btn--secondary btn--small" href={`/api/admin/orders.csv?${query}`} download>
            <Icon name="upload" size={16} /> Export CSV
          </a>
          <button className="btn btn--secondary btn--small" onClick={reload} disabled={loading}>
            <Icon name="refresh" size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="kpis kpis--5">
        <Kpi label="Revenue" value={money(s.revenueCents)} foot={RANGES.find((r) => r.id === range)?.label} tone="accent" />
        <Kpi label="Paid orders" value={s.paid.toLocaleString()} foot={s.paid ? `${money(s.revenueCents / s.paid)} average` : '—'} onClick={() => set({ status: 'paid' })} />
        <Kpi label="Waiting for payment" value={s.pending.toLocaleString()} foot="Pending or confirming on-chain" onClick={() => set({ status: 'pending' })} />
        <Kpi label="Expired / failed" value={(s.expired + s.failed).toLocaleString()} foot={`${s.expired} expired · ${s.failed} failed`} tone={s.failed ? 'warn' : undefined} onClick={() => set({ status: 'expired' })} />
        <Kpi label="Checkout conversion" value={`${s.conversion.toFixed(1)}%`} foot="Orders that ended up paid" />
      </div>

      <div className="toolbar slist__toolbar">
        <div className="search-field slist__search">
          <Icon name="search" size={16} />
          <input placeholder="Search email, order or invoice ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        </div>
        <div className="seg" role="tablist" aria-label="Status">
          {STATUSES.map((f) => (
            <button key={f.id} role="tab" aria-selected={status === f.id} className={status === f.id ? 'seg--on' : ''} onClick={() => set({ status: f.id })}>
              {f.label}
            </button>
          ))}
        </div>
        <select className="input input--small" value={provider} onChange={(e) => set({ provider: e.target.value })} aria-label="Payment processor">
          <option value="">All processors</option>
          <option value="nowpayments">NOWPayments</option>
          <option value="btcpay">BTCPay</option>
          <option value="test">Test</option>
        </select>
        <select className="input input--small" value={range} onChange={(e) => set({ range: e.target.value })} aria-label="Date range">
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {data.orders.length === 0 ? (
        <div className="panel slist__empty">
          <p className="muted">No orders match these filters.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table table--hover">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Pass</th>
                <th className="num">Amount</th>
                <th>Paid with</th>
                <th>Status</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => (
                <tr key={o.id} className="is-clickable" onClick={() => setOpen(o)}>
                  <td className="small">{dateTime(o.createdAt)}</td>
                  <td>{o.email}</td>
                  <td>
                    {o.months} month{o.months > 1 ? 's' : ''}
                  </td>
                  <td className="num">{money(o.amountCents)}</td>
                  <td>
                    {o.payCurrency ? <strong className="small">{o.payCurrency.toUpperCase()}</strong> : <span className="muted small">—</span>}
                    <div className="muted small">{PROVIDERS[o.provider] ?? o.provider}</div>
                  </td>
                  <td>
                    <span className={`status status--${o.status}`}>{o.status}</span>
                  </td>
                  <td className="mono small muted">{o.id.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />

      {open && (
        <OrderDrawer
          order={open}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function OrderDrawer({ order: o, onClose, onChanged }: { order: AdminOrder; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const dialog = useDialog()
  const [busy, setBusy] = useState(false)

  const markPaid = async () => {
    const note = await dialog.prompt({
      title: `Mark order as paid?`,
      message: `This unlocks ${o.months} month${o.months > 1 ? 's' : ''} for ${o.email} straight away. Add a short note for the records (for example "paid by bank transfer").`,
      placeholder: 'Note (optional)',
      optional: true,
      confirmLabel: 'Mark paid',
    })
    if (note === null) return
    setBusy(true)
    try {
      await api.post(`/admin/orders/${encodeURIComponent(o.id)}/mark-paid`, { note })
      toast('Order marked paid and access unlocked', 'success')
      onChanged()
    } catch (err) {
      toast(errorMessage(err), 'error')
      setBusy(false)
    }
  }

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast('Copied', 'success'), () => {})

  return (
    <Drawer
      onClose={onClose}
      title={
        <div>
          <h2>{money(o.amountCents)}</h2>
          <span className={`status status--${o.status}`}>{o.status}</span>
        </div>
      }
    >
      <section className="side-panel__section">
        <h3>Order</h3>
        <dl className="facts">
          <dt>Customer</dt>
          <dd>
            {o.userId ? (
              <Link to={`/admin/users?q=${encodeURIComponent(o.email)}`} onClick={onClose}>
                {o.email}
              </Link>
            ) : (
              o.email
            )}
          </dd>
          <dt>Pass</dt>
          <dd>
            {o.months} month{o.months > 1 ? 's' : ''} membership
          </dd>
          <dt>Amount</dt>
          <dd>{money(o.amountCents)}</dd>
          <dt>Processor</dt>
          <dd>{PROVIDERS[o.provider] ?? o.provider}</dd>
          <dt>Paid with</dt>
          <dd>{o.payCurrency ? o.payCurrency.toUpperCase() : '—'}</dd>
          <dt>Created</dt>
          <dd>{new Date(o.createdAt).toLocaleString()}</dd>
          <dt>Paid</dt>
          <dd>{o.paidAt ? new Date(o.paidAt).toLocaleString() : '—'}</dd>
          <dt>Order ID</dt>
          <dd>
            <button className="btn btn--link small mono" onClick={() => copy(o.id)} title="Copy">
              {o.id}
            </button>
          </dd>
          {o.providerInvoiceId && (
            <>
              <dt>Invoice ID</dt>
              <dd>
                <button className="btn btn--link small mono" onClick={() => copy(o.providerInvoiceId!)} title="Copy">
                  {o.providerInvoiceId}
                </button>
              </dd>
            </>
          )}
        </dl>
      </section>
      <section className="side-panel__section">
        <h3>Actions</h3>
        <div className="grant-row">
          {o.checkoutUrl && (
            <a className="btn btn--secondary btn--small" href={o.checkoutUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} /> Open invoice
            </a>
          )}
          {o.status !== 'paid' && (
            <button className="btn btn--accent btn--small" disabled={busy} onClick={markPaid}>
              Mark as paid
            </button>
          )}
        </div>
        {o.status !== 'paid' && (
          <p className="muted small">Use "Mark as paid" when a customer paid off-platform or topped up an underpaid invoice. It's recorded in the admin history.</p>
        )}
      </section>
    </Drawer>
  )
}
