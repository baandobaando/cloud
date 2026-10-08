import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { AdminUserDetail, AdminUserFilter, AdminUserPage, AdminUserRow, AdminUserSort } from '../../shared/types'
import { api, errorMessage } from '../api'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import Icon from '../components/Icon'
import { ErrorState, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { useDialog } from '../components/Dialog'
import { timeAgo } from './BunnyImport'
import { Drawer, Kpi, Pager, date, dateTime, money, useDebounced } from './ui'
import { usePageTitle } from '../usePageTitle'

const FILTERS: { id: AdminUserFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'members', label: 'Members' },
  { id: 'comp', label: 'Complimentary' },
  { id: 'expired', label: 'Expired' },
  { id: 'free', label: 'Never paid' },
  { id: 'admins', label: 'Admins' },
]

/** Membership state as a short label plus a status colour. */
export function membership(u: AdminUserRow): { text: string; cls: string; detail: string } {
  const s = u.subscription
  if (!s) return { text: 'Free', cls: '', detail: 'No membership' }
  if (s.currentPeriodEnd !== null && s.currentPeriodEnd < Date.now()) return { text: 'Expired', cls: 'status--expired', detail: `Ended ${date(s.currentPeriodEnd)}` }
  const kind = s.source === 'comp' ? 'Complimentary' : s.source === 'test' ? 'Test' : 'Member'
  return { text: kind, cls: s.source === 'comp' ? 'status--comp' : 'status--paid', detail: s.currentPeriodEnd === null ? 'No end date' : `Until ${date(s.currentPeriodEnd)}` }
}

export default function Users() {
  usePageTitle('Admin · Users')
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const search = useDebounced(q)
  const filter = (params.get('filter') as AdminUserFilter) || 'all'
  const sort = (params.get('sort') as AdminUserSort) || 'newest'
  const page = Number(params.get('page')) || 1
  const [openId, setOpenId] = useState<number | null>(null)

  const set = (patch: Record<string, string>) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
      if (!('page' in patch)) next.delete('page')
      return next
    })

  const query = `q=${encodeURIComponent(search)}&filter=${filter}&sort=${sort}`
  const { data, error, loading, reload } = useApi<AdminUserPage>(`/admin/users?${query}&page=${page}`)

  if (error && !data) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <Spinner />
  const s = data.stats

  return (
    <div className="slist">
      <div className="admin__head slist__head">
        <div>
          <h1>Users</h1>
          <p className="muted small">
            {s.total.toLocaleString()} accounts · {s.members.toLocaleString()} with access right now
          </p>
        </div>
        <div className="admin__actions">
          <a className="btn btn--secondary btn--small" href={`/api/admin/users.csv?${query}`} download>
            <Icon name="upload" size={16} /> Export CSV
          </a>
          <button className="btn btn--secondary btn--small" onClick={reload} disabled={loading}>
            <Icon name="refresh" size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="kpis kpis--5">
        <Kpi label="Accounts" value={s.total.toLocaleString()} foot={`+${s.new7d} in the last 7 days`} tone="accent" onClick={() => set({ filter: 'all', sort: 'newest' })} />
        <Kpi label="Paying members" value={s.paying.toLocaleString()} foot={`${s.total ? ((s.paying / s.total) * 100).toFixed(1) : 0}% of accounts`} onClick={() => set({ filter: 'members' })} />
        <Kpi label="Complimentary" value={s.comp.toLocaleString()} foot="Access granted by an admin" onClick={() => set({ filter: 'comp' })} />
        <Kpi label="Expired" value={s.expired.toLocaleString()} foot="Pass ran out, worth a nudge" tone={s.expired ? 'warn' : undefined} onClick={() => set({ filter: 'expired' })} />
        <Kpi label="Admins" value={s.admins.toLocaleString()} foot="Full access to this panel" onClick={() => set({ filter: 'admins' })} />
      </div>

      <div className="toolbar slist__toolbar">
        <div className="search-field slist__search">
          <Icon name="search" size={16} />
          <input placeholder="Search by email or name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </div>
        <div className="seg" role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'seg--on' : ''} onClick={() => set({ filter: f.id === 'all' ? '' : f.id })}>
              {f.label}
            </button>
          ))}
        </div>
        <select className="input input--small" value={sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="active">Recently watching</option>
          <option value="spent">Most spent</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {data.users.length === 0 ? (
        <div className="panel slist__empty">
          <p className="muted">No users match.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table table--hover users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Membership</th>
                <th className="num">Spent</th>
                <th className="num">Views 30d</th>
                <th>Last watched</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const m = membership(u)
                return (
                  <tr key={u.id} className="is-clickable" onClick={() => setOpenId(u.id)}>
                    <td>
                      <div className="user-cell">
                        <span className="user-cell__avatar">{u.name[0]?.toUpperCase()}</span>
                        <div>
                          <div className="table__title">
                            {u.name} {u.isAdmin && <span className="tag">admin</span>}
                          </div>
                          <div className="muted small">{u.email}</div>
                          <div className="slist__tags">
                            {u.signInMethods.map((x) => (
                              <span key={x} className="slist__tag">
                                {x === 'password' ? 'Email' : x === 'google' ? 'Google' : x === 'facebook' ? 'Facebook' : 'Apple'}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`status ${m.cls}`}>{m.text}</span>
                      <div className="muted small">{m.detail}</div>
                    </td>
                    <td className="num">
                      {money(u.totalSpentCents)}
                      <div className="muted small">
                        {u.paidOrders} order{u.paidOrders === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="num">{u.views30d.toLocaleString()}</td>
                    <td className="muted small">{u.lastWatchedAt ? timeAgo(u.lastWatchedAt) : 'Never'}</td>
                    <td className="muted small" title={new Date(u.createdAt).toLocaleString()}>
                      {date(u.createdAt)}
                    </td>
                    <td>
                      <button
                        className="btn btn--secondary btn--small"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenId(u.id)
                        }}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />

      {openId !== null && <UserDrawer id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  )
}

const GRANTS: { label: string; days: number | null }[] = [
  { label: '+7 days', days: 7 },
  { label: '+30 days', days: 30 },
  { label: '+90 days', days: 90 },
  { label: '+1 year', days: 365 },
  { label: 'No end date', days: null },
]

function UserDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { me } = useSession()
  const toast = useToast()
  const dialog = useDialog()
  const { data, error, reload } = useApi<AdminUserDetail>(`/admin/users/${id}`)
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await fn()
      toast(done, 'success')
      reload()
      onChanged()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Drawer title="User" onClose={onClose}><ErrorState message={error} onRetry={reload} /></Drawer>
  if (!data) return <Drawer title="User" onClose={onClose}><Spinner /></Drawer>
  const u = data.user
  const m = membership(u)
  const isMe = me?.id === u.id
  const openEnded = u.subscription?.currentPeriodEnd === null

  const grant = (days: number | null) =>
    act(() => api.post(`/admin/users/${u.id}/access`, { days }), days === null ? 'Access granted with no end date' : `Added ${days} days of access`)

  const revoke = async () => {
    if (!(await dialog.confirm({ title: `Remove ${u.email}'s access?`, message: "Access ends immediately. This doesn't refund any payment.", confirmLabel: 'Remove access', danger: true }))) return
    act(() => api.del(`/admin/users/${u.id}/access`), 'Access removed')
  }
  const toggleAdmin = async () => {
    const ok = await dialog.confirm(
      u.isAdmin
        ? { title: `Remove admin access from ${u.email}?`, confirmLabel: 'Remove admin', danger: true }
        : { title: `Make ${u.email} an admin?`, message: 'Admins can change everything: series, users, orders and payments.', confirmLabel: 'Make admin' },
    )
    if (ok) act(() => api.patch(`/admin/users/${u.id}`, { isAdmin: !u.isAdmin }), u.isAdmin ? 'Admin access removed' : 'Now an admin')
  }
  const signOut = async () => {
    if (await dialog.confirm({ title: `Sign ${u.email} out everywhere?`, message: `Ends ${data.activeSessions} active session${data.activeSessions === 1 ? '' : 's'} on all devices.`, confirmLabel: 'Sign out' }))
      act(() => api.post(`/admin/users/${u.id}/sign-out`), 'Signed out of every device')
  }
  const remove = async () => {
    const typed = await dialog.prompt({
      title: `Delete ${u.email}?`,
      message: 'Permanently deletes the account, profiles, My List, watch history and orders. Payment records are kept for accounting. Type DELETE to confirm.',
      requireText: 'DELETE',
      confirmLabel: 'Delete account',
      danger: true,
    })
    if (typed !== 'DELETE') return
    setBusy(true)
    try {
      await api.del(`/admin/users/${u.id}`)
      toast('Account deleted', 'success')
      onChanged()
      onClose()
    } catch (err) {
      toast(errorMessage(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title={
        <div className="user-cell">
          <span className="user-cell__avatar user-cell__avatar--lg">{u.name[0]?.toUpperCase()}</span>
          <div>
            <h2>{u.name}</h2>
            <div className="muted small">{u.email}</div>
          </div>
        </div>
      }
    >
      <div className="side-panel__stats">
        <div>
          <strong>{money(u.totalSpentCents)}</strong>
          <span>spent</span>
        </div>
        <div>
          <strong>{u.paidOrders}</strong>
          <span>paid orders</span>
        </div>
        <div>
          <strong>{u.views30d}</strong>
          <span>views (30d)</span>
        </div>
        <div>
          <strong>{data.activeSessions}</strong>
          <span>devices signed in</span>
        </div>
      </div>

      <section className="side-panel__section">
        <h3>Membership</h3>
        <div className="member-card">
          <div>
            <span className={`status ${m.cls}`}>{m.text}</span>
            <p className="muted small">{m.detail}</p>
          </div>
          {u.subscription && (
            <button className="btn btn--link small" disabled={busy} onClick={revoke}>
              Remove access
            </button>
          )}
        </div>
        <p className="muted small">Give free access. Days are added on top of any time they already have.</p>
        <div className="grant-row">
          {GRANTS.map((g) => (
            <button key={g.label} className="btn btn--secondary btn--small" disabled={busy || (openEnded && g.days !== null)} onClick={() => grant(g.days)}>
              {g.label}
            </button>
          ))}
        </div>
      </section>

      <section className="side-panel__section">
        <h3>Account</h3>
        <dl className="facts">
          <dt>Joined</dt>
          <dd>{new Date(u.createdAt).toLocaleString()}</dd>
          <dt>Signs in with</dt>
          <dd>{u.signInMethods.map((x) => (x === 'password' ? 'Email & password' : x === 'google' ? 'Google' : x === 'facebook' ? 'Facebook' : 'Apple')).join(', ') || '—'}</dd>
          <dt>Last watched</dt>
          <dd>{u.lastWatchedAt ? dateTime(u.lastWatchedAt) : 'Never'}</dd>
          <dt>User ID</dt>
          <dd>{u.id}</dd>
        </dl>
        <div className="grant-row">
          <button className="btn btn--secondary btn--small" disabled={busy || isMe} onClick={toggleAdmin} title={isMe ? "You can't change your own admin access" : undefined}>
            {u.isAdmin ? 'Remove admin' : 'Make admin'}
          </button>
          <button className="btn btn--secondary btn--small" disabled={busy || data.activeSessions === 0} onClick={signOut}>
            Sign out everywhere
          </button>
          <button className="btn btn--danger btn--small" disabled={busy || isMe || u.isAdmin} onClick={remove} title={u.isAdmin ? 'Remove admin access first' : undefined}>
            <Icon name="trash" size={14} /> Delete account
          </button>
        </div>
      </section>

      <section className="side-panel__section">
        <h3>Profiles ({data.profiles.length})</h3>
        <ul className="mini-list">
          {data.profiles.map((p) => (
            <li key={p.id}>
              <span className="user-cell__avatar user-cell__avatar--sm" style={{ background: p.color }}>
                {p.name[0]?.toUpperCase()}
              </span>
              <span>{p.name}</span>
              <span className="muted small">
                {p.watching} watching · {p.listCount} in My List
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="side-panel__section">
        <h3>Orders ({data.orders.length})</h3>
        {data.orders.length === 0 ? (
          <p className="muted small">No orders yet.</p>
        ) : (
          <ul className="mini-list">
            {data.orders.map((o) => (
              <li key={o.id}>
                <span className={`status status--${o.status}`}>{o.status}</span>
                <span>
                  {money(o.amountCents)} · {o.months} mo{o.payCurrency ? ` · ${o.payCurrency.toUpperCase()}` : ''}
                </span>
                <span className="muted small">{dateTime(o.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link className="link small" to={`/admin/orders?q=${encodeURIComponent(u.email)}`} onClick={onClose}>
          See in Orders →
        </Link>
      </section>

      <section className="side-panel__section">
        <h3>Recently watched</h3>
        {data.recentViews.length === 0 ? (
          <p className="muted small">Hasn't watched anything yet.</p>
        ) : (
          <ul className="mini-list">
            {data.recentViews.map((v, i) => (
              <li key={i}>
                <Link to={`/admin/series/${v.seriesId}`} onClick={onClose}>
                  {v.seriesTitle}
                </Link>
                <span className="muted small">Ep {v.episodeNumber}</span>
                <span className="muted small">{timeAgo(v.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="side-panel__section">
        <h3>Admin history</h3>
        {data.activity.length === 0 ? (
          <p className="muted small">No admin changes to this account.</p>
        ) : (
          <ul className="mini-list">
            {data.activity.map((a) => (
              <li key={a.id}>
                <strong className="small">{a.action}</strong>
                <span className="muted small">{a.detail}</span>
                <span className="muted small">
                  {a.adminEmail} · {timeAgo(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Drawer>
  )
}
