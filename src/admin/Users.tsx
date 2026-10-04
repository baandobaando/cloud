import { useEffect, useState } from 'react'
import type { AdminUser } from '../../shared/types'
import { api, errorMessage } from '../api'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { useDialog } from '../components/Dialog'

function accessLabel(u: AdminUser): { text: string; cls: string } {
  const s = u.subscription
  if (!s) return { text: 'Free', cls: '' }
  if (s.currentPeriodEnd !== null && s.currentPeriodEnd < Date.now()) return { text: 'Expired', cls: 'status--expired' }
  const until = s.currentPeriodEnd === null ? 'forever' : `until ${new Date(s.currentPeriodEnd).toLocaleDateString()}`
  const src = s.source === 'comp' ? ' · comp' : s.source === 'test' ? ' · test' : ''
  return { text: `Member ${until}${src}`, cls: 'status--paid' }
}

export default function Users() {
  const { me } = useSession()
  const toast = useToast()
  const dialog = useDialog()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<'all' | 'subscribers' | 'admins'>('all')
  const [granting, setGranting] = useState<AdminUser | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250)
    return () => clearTimeout(t)
  }, [q])

  const { data, setData, error, reload } = useApi<AdminUser[]>(`/admin/users?q=${encodeURIComponent(debounced)}&filter=${filter}`)

  const replace = (u: AdminUser) => setData((list) => list?.map((x) => (x.id === u.id ? u : x)))

  const toggleAdmin = async (u: AdminUser) => {
    const ok = await dialog.confirm(
      u.isAdmin
        ? { title: `Remove admin access from ${u.email}?`, confirmLabel: 'Remove admin', danger: true }
        : { title: `Make ${u.email} an admin?`, message: 'Admins can change everything, including series, users and orders.', confirmLabel: 'Make admin' },
    )
    if (!ok) return
    try {
      replace(await api.patch<AdminUser>(`/admin/users/${u.id}`, { isAdmin: !u.isAdmin }))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const revoke = async (u: AdminUser) => {
    const ok = await dialog.confirm({
      title: `Remove ${u.email}'s membership?`,
      message: "Access ends immediately. This doesn't refund any payment.",
      confirmLabel: 'Remove access',
      danger: true,
    })
    if (!ok) return
    try {
      replace(await api.del<AdminUser>(`/admin/users/${u.id}/access`))
      toast('Access removed', 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  return (
    <>
      <div className="admin__head">
        <h1>Users</h1>
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search by email or name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="segmented segmented--small">
          {(['all', 'subscribers', 'admins'] as const).map((f) => (
            <button key={f} className={`segmented__opt ${filter === f ? 'segmented__opt--on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'subscribers' ? 'Members' : 'Admins'}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <p className="muted">No users found.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>User</th><th>Membership</th><th>Joined</th><th /></tr>
          </thead>
          <tbody>
            {data.map((u) => {
              const a = accessLabel(u)
              return (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong> {u.isAdmin && <span className="tag tag--accent">admin</span>}
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td><span className={`status ${a.cls}`}>{a.text}</span></td>
                  <td className="muted small">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="row-actions">
                    <button className="btn btn--link small" onClick={() => setGranting(u)}>Grant access</button>
                    {u.subscription && <button className="btn btn--link small" onClick={() => revoke(u)}>Revoke</button>}
                    {u.id !== me?.id && (
                      <button className="btn btn--link small" onClick={() => toggleAdmin(u)}>{u.isAdmin ? 'Remove admin' : 'Make admin'}</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {granting && (
        <GrantDialog
          user={granting}
          onClose={() => setGranting(null)}
          onDone={(u) => {
            replace(u)
            setGranting(null)
            toast(`Access granted to ${u.email}`, 'success')
          }}
        />
      )}
    </>
  )
}

function GrantDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (u: AdminUser) => void }) {
  const toast = useToast()
  const [days, setDays] = useState<string>('30')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      onDone(await api.post<AdminUser>(`/admin/users/${user.id}/access`, { days: days === 'forever' ? null : Number(days) }))
    } catch (err) {
      toast(errorMessage(err), 'error')
      setBusy(false)
    }
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h2>Grant free access</h2>
        <p className="muted small">{user.email}. Replaces any current membership end date.</p>
        <label className="field">
          <span>Duration</span>
          <select className="input" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="forever">No end date</option>
          </select>
        </label>
        <div className="admin__actions">
          <button className="btn btn--accent" disabled={busy} onClick={submit}>{busy ? 'Granting…' : 'Grant access'}</button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
