import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminSeries } from '../../shared/types'
import { IS_DEMO, api, errorMessage } from '../api'
import { useApi } from '../useApi'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import { ErrorState, Spinner } from '../components/Feedback'
import { useDialog } from '../components/Dialog'
import { useToast } from '../components/Toast'
import BunnyImport from './BunnyImport'

export default function SeriesList() {
  const { data, error, reload } = useApi<AdminSeries[]>('/admin/series')
  const dialog = useDialog()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'live' | 'draft'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <Spinner />

  const needle = q.trim().toLowerCase()
  const rows = data.filter(
    (s) =>
      (filter === 'all' || (filter === 'live') === s.published) &&
      (!needle || s.title.toLowerCase().includes(needle) || s.id.includes(needle)),
  )
  const visibleSelected = rows.filter((s) => selected.has(s.id))
  const allVisibleSelected = rows.length > 0 && visibleSelected.length === rows.length

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (allVisibleSelected) rows.forEach((s) => next.delete(s.id))
      else rows.forEach((s) => next.add(s.id))
      return next
    })

  const remove = async (items: AdminSeries[]) => {
    if (items.length === 0) return
    const one = items.length === 1
    const episodes = items.reduce((n, s) => n + s.episodeCount, 0)
    const typed = await dialog.prompt({
      title: one ? `Delete “${items[0].title}”?` : `Delete ${items.length} series?`,
      message: `${one ? 'It' : 'They'} and ${episodes.toLocaleString()} episodes will be removed from the site. Videos stored in Bunny are kept, and the automatic sync won't add ${one ? 'it' : 'them'} back (you can restore from the Bunny panel). Type DELETE to confirm.`,
      requireText: 'DELETE',
      confirmLabel: one ? 'Delete series' : `Delete ${items.length} series`,
      danger: true,
    })
    if (typed !== 'DELETE') return
    setBusy(true)
    try {
      const { deleted } = await api.post<{ deleted: number }>('/admin/series/bulk-delete', { ids: items.map((s) => s.id) })
      toast(`Deleted ${deleted} series`, 'success')
      setSelected((cur) => {
        const next = new Set(cur)
        items.forEach((s) => next.delete(s.id))
        return next
      })
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="admin__head">
        <h1>Series</h1>
        <Link to="/admin/series/new" className="btn btn--accent">+ New series</Link>
      </div>
      {!IS_DEMO && <BunnyImport onImported={reload} />}
      <div className="toolbar">
        <input className="input" placeholder="Search series…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="segmented segmented--small">
          {(['all', 'live', 'draft'] as const).map((f) => (
            <button key={f} className={`segmented__opt ${filter === f ? 'segmented__opt--on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? `All (${data.length})` : f === 'live' ? 'Live' : 'Drafts'}
            </button>
          ))}
        </div>
        {visibleSelected.length > 0 && (
          <div className="toolbar__selection">
            <span className="muted small">{visibleSelected.length} selected</span>
            <button className="btn btn--danger btn--small" disabled={busy} onClick={() => remove(visibleSelected)}>
              <Icon name="trash" size={16} /> Delete selected
            </button>
            <button className="btn btn--link small" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="muted">No series match.</p>
      ) : (
        <table className="table table--hover">
          <thead>
            <tr>
              <th className="table__check">
                <input id="select-all-series" type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all series" />
              </th>
              <th />
              <th>Title</th>
              <th>Status</th>
              <th className="num">Episodes</th>
              <th className="num">Free</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className={selected.has(s.id) ? 'is-selected' : ''}>
                <td className="table__check">
                  <input id={`select-${s.id}`} type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.title}`} />
                </td>
                <td className="table__thumb"><Link to={`/admin/series/${s.id}`} aria-label={s.title}><Poster series={s} showTitle={false} /></Link></td>
                <td>
                  <Link to={`/admin/series/${s.id}`} className="table__title">{s.title}</Link>
                  <div className="muted small">{s.genres.join(' · ')}</div>
                </td>
                <td>{s.published ? <span className="status status--paid">Live</span> : <span className="status">Draft</span>}</td>
                <td className="num">{s.episodeCount}</td>
                <td className="num">{s.freeEpisodes}</td>
                <td className="muted small">{new Date(s.updatedAt).toLocaleDateString()}</td>
                <td className="row-actions">
                  <button className="icon-btn icon-btn--small" title="Delete series" aria-label={`Delete ${s.title}`} disabled={busy} onClick={() => remove([s])}>
                    <Icon name="trash" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
