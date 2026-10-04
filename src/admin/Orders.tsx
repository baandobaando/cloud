import { useState } from 'react'
import { formatPrice, type OrderStatus } from '../../shared/types'
import Icon from '../components/Icon'
import { api, errorMessage } from '../api'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { useDialog } from '../components/Dialog'

interface AdminOrder {
  id: string
  email: string
  plan: string
  months: number
  amountCents: number
  provider: string
  providerInvoiceId: string | null
  status: OrderStatus
  payCurrency: string | null
  createdAt: number
  paidAt: number | null
}

const FILTERS: { id: OrderStatus | ''; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirming', label: 'Confirming' },
  { id: 'expired', label: 'Expired' },
  { id: 'failed', label: 'Failed' },
]

export default function Orders() {
  const toast = useToast()
  const dialog = useDialog()
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const { data, error, reload } = useApi<AdminOrder[]>(`/admin/orders?status=${status}`)

  const markPaid = async (o: AdminOrder) => {
    const ok = await dialog.confirm({
      title: `Mark order ${o.id.slice(0, 8)} as paid?`,
      message: `${o.email} gets ${o.months} month(s) of membership. Only do this after confirming the funds arrived in your ${o.provider} dashboard.`,
      confirmLabel: 'Mark paid',
    })
    if (!ok) return
    try {
      await api.post(`/admin/orders/${o.id}/mark-paid`)
      toast('Order marked paid', 'success')
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <>
      <div className="admin__head">
        <h1>Orders</h1>
        <button className="btn btn--secondary btn--small" onClick={reload}><Icon name="refresh" size={16} /> Refresh</button>
      </div>
      <p className="muted small">
        Every checkout creates an order. Payments are confirmed automatically by your processor's signed webhook. Use
        “Mark paid” only for underpaid invoices you've resolved by hand.
      </p>
      <div className="toolbar">
        <div className="segmented segmented--small">
          {FILTERS.map((f) => (
            <button key={f.id} className={`segmented__opt ${status === f.id ? 'segmented__opt--on' : ''}`} onClick={() => setStatus(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <p className="muted">No orders.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Created</th><th>User</th><th>Pass</th><th>Processor</th><th className="num">Amount</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {data.map((o) => (
              <tr key={o.id}>
                <td className="small">{new Date(o.createdAt).toLocaleString()}</td>
                <td>{o.email}</td>
                <td>{o.months} month{o.months > 1 ? 's' : ''}</td>
                <td>
                  {o.provider}
                  {o.providerInvoiceId && <div className="muted small mono" title={o.providerInvoiceId}>{o.providerInvoiceId.slice(0, 14)}</div>}
                </td>
                <td className="num">
                  {formatPrice(o.amountCents)}
                  {o.payCurrency && <div className="muted small">in {o.payCurrency}</div>}
                </td>
                <td><span className={`status status--${o.status}`}>{o.status}</span></td>
                <td>{o.status !== 'paid' && <button className="btn btn--link small" onClick={() => markPaid(o)}>Mark paid</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
