import type { AdminActivity } from '../../shared/types'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { useApi } from '../useApi'
import { ErrorState, Spinner } from '../components/Feedback'
import { timeAgo } from './BunnyImport'
import { usePageTitle } from '../usePageTitle'

/** Where an activity row points: a user, an order or a series. */
function targetLink(target: string): { to: string; label: string } | null {
  const [kind, id] = target.split(':')
  if (kind === 'series') return { to: `/admin/series/${id}`, label: 'Series' }
  if (kind === 'order') return { to: `/admin/orders?q=${encodeURIComponent(id)}`, label: 'Order' }
  return null
}

export default function Activity() {
  usePageTitle('Admin · Activity')
  const { data, error, loading, reload } = useApi<AdminActivity[]>('/admin/activity?limit=200')
  if (error && !data) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <Spinner />

  return (
    <div className="slist">
      <div className="admin__head slist__head">
        <div>
          <h1>Activity</h1>
          <p className="muted small">Every change made in the admin panel: access granted or removed, accounts deleted, orders marked paid, series deleted.</p>
        </div>
        <button className="btn btn--secondary btn--small" onClick={reload} disabled={loading}>
          <Icon name="refresh" size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>
      {data.length === 0 ? (
        <div className="panel slist__empty">
          <p className="muted">Nothing yet. Changes you make in the admin panel will be listed here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Details</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => {
                const link = targetLink(a.target)
                return (
                  <tr key={a.id}>
                    <td className="small" title={new Date(a.createdAt).toLocaleString()}>
                      {timeAgo(a.createdAt)}
                    </td>
                    <td>
                      <strong className="small">{a.action}</strong>
                    </td>
                    <td className="small">
                      {a.detail}
                      {link && (
                        <>
                          {' '}
                          <Link className="link" to={link.to}>
                            {link.label} →
                          </Link>
                        </>
                      )}
                    </td>
                    <td className="muted small">{a.adminEmail}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
