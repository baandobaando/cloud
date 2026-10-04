import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GENRES, type AdminSeries, type Genre } from '../../shared/types'
import { IS_DEMO, api, errorMessage } from '../api'
import { useApi } from '../useApi'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import { ErrorState, Spinner } from '../components/Feedback'
import { useDialog } from '../components/Dialog'
import { useToast } from '../components/Toast'
import BunnyImport, { timeAgo, type BunnyStatus } from './BunnyImport'
import { usePageTitle } from '../usePageTitle'

type StatusFilter = 'all' | 'live' | 'draft' | 'attention'
type Sort = 'updated' | 'episodes' | 'views' | 'newest' | 'az'
type View = 'table' | 'grid'

const VIEW_KEY = 'bingetube:admin-series-view'
const DAY = 86_400_000

const num = (v: number) => v.toLocaleString()
const hours = (sec: number) => (sec >= 3600 ? `${(sec / 3600).toFixed(sec >= 36_000 ? 0 : 1)} h` : `${Math.round(sec / 60)} min`)

/** Why a series may need a look: no cover, no episodes, very short, or not published. */
function issues(s: AdminSeries): string[] {
  const out: string[] = []
  if (!s.posterUrl) out.push('No cover')
  if (s.episodeCount === 0) out.push('No episodes')
  else if (s.episodeCount < 5) out.push(`Only ${s.episodeCount} episode${s.episodeCount === 1 ? '' : 's'}`)
  if (s.freeEpisodes > s.episodeCount) out.push('Free count above episodes')
  return out
}

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'table'
  } catch {
    return 'table'
  }
}

export default function SeriesList() {
  usePageTitle('Admin · Series')
  const { data, error, loading, reload } = useApi<AdminSeries[]>('/admin/series')
  const bunny = useApi<BunnyStatus>(IS_DEMO ? null : '/admin/bunny/status')
  const dialog = useDialog()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [genre, setGenre] = useState<Genre | ''>('')
  const [sort, setSort] = useState<Sort>('updated')
  const [view, setView] = useState<View>(savedView)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now())

  const refresh = () => {
    reload()
    bunny.reload()
    setRefreshedAt(Date.now())
  }

  const chooseView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* storage blocked */
    }
  }

  const stats = useMemo(() => {
    if (!data) return null
    const live = data.filter((s) => s.published)
    const episodes = data.reduce((n, s) => n + s.episodeCount, 0)
    const runtime = data.reduce((n, s) => n + (s.runtimeSec ?? 0), 0)
    const views = data.reduce((n, s) => n + (s.views30d ?? 0), 0)
    const weekAgo = Date.now() - 7 * DAY
    return {
      total: data.length,
      live: live.length,
      drafts: data.length - live.length,
      episodes,
      liveEpisodes: live.reduce((n, s) => n + s.episodeCount, 0),
      avg: data.length ? episodes / data.length : 0,
      biggest: data.reduce<AdminSeries | null>((a, s) => (!a || s.episodeCount > a.episodeCount ? s : a), null),
      runtime,
      views,
      bunny: data.filter((s) => s.source === 'bunny').length,
      newThisWeek: data.filter((s) => s.createdAt > weekAgo).length,
      newEpisodesThisWeek: data.filter((s) => s.createdAt > weekAgo).reduce((n, s) => n + s.episodeCount, 0),
      attention: data.filter((s) => issues(s).length > 0).length,
      noCover: data.filter((s) => !s.posterUrl).length,
      genres: GENRES.map((g) => {
        const items = data.filter((s) => s.genres.includes(g))
        return {
          genre: g,
          series: items.length,
          episodes: items.reduce((n, s) => n + s.episodeCount, 0),
        }
      }).sort((a, b) => b.series - a.series),
    }
  }, [data])

  if (error && !data) return <ErrorState message={error} onRetry={reload} />
  if (!data || !stats) return <Spinner />

  const needle = q.trim().toLowerCase()
  const rows = data
    .filter(
      (s) =>
        (status === 'all' ||
          (status === 'live' && s.published) ||
          (status === 'draft' && !s.published) ||
          (status === 'attention' && issues(s).length > 0)) &&
        (!genre || s.genres.includes(genre)) &&
        (!needle || s.title.toLowerCase().includes(needle) || s.id.includes(needle)),
    )
    .sort((a, b) => {
      switch (sort) {
        case 'episodes':
          return b.episodeCount - a.episodeCount
        case 'views':
          return (b.views30d ?? 0) - (a.views30d ?? 0)
        case 'newest':
          return b.createdAt - a.createdAt
        case 'az':
          return a.title.localeCompare(b.title)
        default:
          return b.updatedAt - a.updatedAt
      }
    })
  const maxEpisodes = Math.max(1, ...data.map((s) => s.episodeCount))
  const maxGenre = Math.max(1, ...stats.genres.map((g) => g.series))
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

  const lastSync = bunny.data?.lastSync

  return (
    <div className="slist">
      <div className="admin__head slist__head">
        <div>
          <h1>Series</h1>
          <p className="muted small">
            {num(stats.total)} series · {num(stats.episodes)} episodes
            {lastSync ? ` · Bunny synced ${timeAgo(lastSync.at)}` : ''} · updated {timeAgo(refreshedAt)}
          </p>
        </div>
        <div className="admin__actions">
          <button className="btn btn--secondary btn--small" onClick={refresh} disabled={loading || bunny.loading}>
            <Icon name="refresh" size={16} className={loading || bunny.loading ? 'spin' : ''} />{' '}
            {loading || bunny.loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link to="/admin/series/new" className="btn btn--accent btn--small">
            <Icon name="plus" size={16} /> New series
          </Link>
        </div>
      </div>

      <div className="kpis slist__kpis">
        <Kpi
          label="Series"
          value={num(stats.total)}
          foot={`${num(stats.live)} live · ${num(stats.drafts)} draft${stats.drafts === 1 ? '' : 's'}`}
          accent
        />
        <Kpi label="Episodes" value={num(stats.episodes)} foot={`${num(stats.liveEpisodes)} on live series`} />
        <Kpi
          label="Avg. episodes / series"
          value={stats.avg.toFixed(1)}
          foot={stats.biggest ? `Longest: ${stats.biggest.episodeCount} eps` : '—'}
        />
        <Kpi label="Total runtime" value={hours(stats.runtime)} foot={`${(stats.runtime / 86_400).toFixed(1)} days of video`} />
        <Kpi label="Views, last 30 days" value={num(stats.views)} foot="Episode starts by signed-in viewers" />
        <Kpi
          label="Bunny library"
          value={bunny.data?.configured ? num(bunny.data.videos ?? 0) : '—'}
          foot={bunny.data?.configured ? `${bunny.data.storageGb} GB · ${num(stats.bunny)} series linked` : 'Not connected'}
        />
        <Kpi label="New this week" value={num(stats.newThisWeek)} foot={`${num(stats.newEpisodesThisWeek)} episodes added`} />
        <button className={`kpi kpi--button ${stats.attention ? 'kpi--warn' : ''}`} onClick={() => setStatus('attention')}>
          <div className="kpi__label">Needs attention</div>
          <div className="kpi__value">{num(stats.attention)}</div>
          <div className="kpi__foot muted">
            {stats.attention ? `${num(stats.noCover)} without a cover · tap to filter` : 'Everything looks good'}
          </div>
        </button>
      </div>

      <div className="dash__row slist__row">
        <section className="panel">
          <header className="panel__head">
            <div>
              <h2>By genre</h2>
              <p className="muted small">Series and episodes in each genre (a series can be in two)</p>
            </div>
          </header>
          <div className="barlist">
            {stats.genres.map((g) => (
              <button
                key={g.genre}
                className={`barlist__row barlist__row--btn ${genre === g.genre ? 'is-on' : ''}`}
                onClick={() => setGenre(genre === g.genre ? '' : g.genre)}
              >
                <div className="barlist__label">
                  <span>{g.genre}</span>
                  <span className="barlist__value">
                    {num(g.series)}
                    <em>{num(g.episodes)} eps</em>
                  </span>
                </div>
                <div className="barlist__track">
                  <div
                    style={{
                      width: `${(g.series / maxGenre) * 100}%`,
                      background: '#3987e5',
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </section>
        {!IS_DEMO && <BunnyImport status={bunny.data ?? null} error={bunny.error} reload={bunny.reload} onImported={reload} />}
      </div>

      <div className="toolbar slist__toolbar">
        <div className="search-field slist__search">
          <Icon name="search" size={16} />
          <input placeholder="Search by title or id…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg" role="tablist" aria-label="Status">
          {(
            [
              ['all', `All ${data.length}`],
              ['live', `Live ${stats.live}`],
              ['draft', `Drafts ${stats.drafts}`],
              ['attention', `Needs attention ${stats.attention}`],
            ] as const
          ).map(([f, label]) => (
            <button key={f} role="tab" aria-selected={status === f} className={status === f ? 'seg--on' : ''} onClick={() => setStatus(f)}>
              {label}
            </button>
          ))}
        </div>
        <select className="input input--small" value={genre} onChange={(e) => setGenre(e.target.value as Genre | '')} aria-label="Genre">
          <option value="">All genres</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select className="input input--small" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="updated">Recently updated</option>
          <option value="newest">Newest added</option>
          <option value="episodes">Most episodes</option>
          <option value="views">Most viewed (30d)</option>
          <option value="az">A–Z</option>
        </select>
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'table' ? 'seg--on' : ''} onClick={() => chooseView('table')} aria-label="Table view" title="Table">
            <Icon name="list" size={16} />
          </button>
          <button className={view === 'grid' ? 'seg--on' : ''} onClick={() => chooseView('grid')} aria-label="Grid view" title="Grid">
            <Icon name="film" size={16} />
          </button>
        </div>
      </div>

      <div className="slist__bar">
        <span className="muted small">
          Showing {num(rows.length)} of {num(data.length)} series · {num(rows.reduce((n, s) => n + s.episodeCount, 0))} episodes
        </span>
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
        <div className="panel slist__empty">
          <p className="muted">No series match these filters.</p>
          <button
            className="btn btn--secondary btn--small"
            onClick={() => {
              setQ('')
              setStatus('all')
              setGenre('')
            }}
          >
            Clear filters
          </button>
        </div>
      ) : view === 'grid' ? (
        <div className="slist__grid">
          {rows.map((s) => {
            const problems = issues(s)
            return (
              <div key={s.id} className={`scard-admin ${selected.has(s.id) ? 'is-selected' : ''}`}>
                <label className="scard-admin__check">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.title}`} />
                </label>
                <Link to={`/admin/series/${s.id}`} className="scard-admin__cover">
                  <Poster series={s} showTitle={false} />
                  <span className={`scard-admin__status ${s.published ? 'is-live' : ''}`}>{s.published ? 'Live' : 'Draft'}</span>
                </Link>
                <Link to={`/admin/series/${s.id}`} className="scard-admin__title">
                  {s.title}
                </Link>
                <div className="scard-admin__meta">
                  <span>{s.episodeCount} eps</span>
                  <span>{hours(s.runtimeSec ?? 0)}</span>
                  <span>{num(s.views30d ?? 0)} views</span>
                </div>
                {problems.length > 0 && <div className="scard-admin__warn">{problems.join(' · ')}</div>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table table--hover slist__table">
            <thead>
              <tr>
                <th className="table__check">
                  <input
                    id="select-all-series"
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Select all series"
                  />
                </th>
                <th />
                <th>Series</th>
                <th>Status</th>
                <th>Episodes</th>
                <th className="num">Runtime</th>
                <th className="num">Views 30d</th>
                <th className="num">Free</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const problems = issues(s)
                return (
                  <tr key={s.id} className={selected.has(s.id) ? 'is-selected' : ''}>
                    <td className="table__check">
                      <input
                        id={`select-${s.id}`}
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        aria-label={`Select ${s.title}`}
                      />
                    </td>
                    <td className="table__thumb">
                      <Link to={`/admin/series/${s.id}`} aria-label={s.title}>
                        <Poster series={s} showTitle={false} />
                      </Link>
                    </td>
                    <td className="slist__name">
                      <Link to={`/admin/series/${s.id}`} className="table__title">
                        {s.title}
                      </Link>
                      <div className="slist__tags">
                        {s.genres.map((g) => (
                          <span key={g} className="slist__tag">
                            {g}
                          </span>
                        ))}
                        {s.source === 'bunny' && <span className="slist__tag slist__tag--src">Bunny</span>}
                      </div>
                      {problems.length > 0 && <div className="slist__warn">⚠ {problems.join(' · ')}</div>}
                    </td>
                    <td>{s.published ? <span className="status status--paid">Live</span> : <span className="status">Draft</span>}</td>
                    <td className="slist__eps">
                      <strong>{s.episodeCount}</strong>
                      <div className="slist__meter">
                        <div
                          style={{
                            width: `${(s.episodeCount / maxEpisodes) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="num">{hours(s.runtimeSec ?? 0)}</td>
                    <td className="num">
                      {num(s.views30d ?? 0)}
                      {!!s.viewers30d && <div className="muted small">{num(s.viewers30d)} viewers</div>}
                    </td>
                    <td className="num">{s.freeEpisodes}</td>
                    <td className="muted small" title={new Date(s.updatedAt).toLocaleString()}>
                      {timeAgo(s.updatedAt)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link className="icon-btn icon-btn--small" to={`/admin/series/${s.id}`} title="Edit" aria-label={`Edit ${s.title}`}>
                          <Icon name="settings" size={16} />
                        </Link>
                        <a
                          className="icon-btn icon-btn--small"
                          href={`/title/${s.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Open on site"
                          aria-label={`Open ${s.title} on the site`}
                        >
                          <Icon name="external" size={16} />
                        </a>
                        <button
                          className="icon-btn icon-btn--small"
                          title="Delete series"
                          aria-label={`Delete ${s.title}`}
                          disabled={busy}
                          onClick={() => remove([s])}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
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

function Kpi({ label, value, foot, accent }: { label: string; value: string; foot: string; accent?: boolean }) {
  return (
    <div className={`kpi ${accent ? 'kpi--accent' : ''}`}>
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{value}</div>
      <div className="kpi__foot muted">{foot}</div>
    </div>
  )
}
