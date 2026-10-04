import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminSeries } from '../../shared/types'
import { useApi } from '../useApi'
import Poster from '../components/Poster'
import { ErrorState, Spinner } from '../components/Feedback'

export default function SeriesList() {
  const { data, error, reload } = useApi<AdminSeries[]>('/admin/series')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'live' | 'draft'>('all')

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <Spinner />

  const needle = q.trim().toLowerCase()
  const rows = data.filter(
    (s) =>
      (filter === 'all' || (filter === 'live') === s.published) &&
      (!needle || s.title.toLowerCase().includes(needle) || s.id.includes(needle)),
  )

  return (
    <>
      <div className="admin__head">
        <h1>Series</h1>
        <Link to="/admin/series/new" className="btn btn--red">+ New series</Link>
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search series…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="segmented segmented--small">
          {(['all', 'live', 'draft'] as const).map((f) => (
            <button key={f} className={`segmented__opt ${filter === f ? 'segmented__opt--on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? `All (${data.length})` : f === 'live' ? 'Live' : 'Drafts'}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">No series match.</p>
      ) : (
        <table className="table table--hover">
          <thead>
            <tr><th /><th>Title</th><th>Status</th><th className="num">Episodes</th><th className="num">Free</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="table__thumb"><Link to={`/admin/series/${s.id}`}><Poster series={s} showTitle={false} /></Link></td>
                <td>
                  <Link to={`/admin/series/${s.id}`} className="table__title">{s.title}</Link>
                  <div className="muted small">{s.genres.join(' · ')}</div>
                </td>
                <td>{s.published ? <span className="status status--paid">Live</span> : <span className="status">Draft</span>}</td>
                <td className="num">{s.episodeCount}</td>
                <td className="num">{s.freeEpisodes}</td>
                <td className="muted small">{new Date(s.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
