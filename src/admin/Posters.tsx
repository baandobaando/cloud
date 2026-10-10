import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminPosterRow } from '../../shared/types'
import { api, errorMessage } from '../api'
import { ErrorState, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { useApi } from '../useApi'
import { usePageTitle } from '../usePageTitle'

type Kind = 'designed' | 'official'
const googleImages = (title: string) => `https://www.google.com/search?udm=2&q=${encodeURIComponent(`${title} short drama poster`)}`

/**
 * Swapping designed posters for the real ones: find the official poster on Google Images, copy its image address,
 * paste it here. Most-watched series come first.
 */
export default function Posters() {
  usePageTitle('Posters')
  const [kind, setKind] = useState<Kind>('designed')
  const [q, setQ] = useState('')
  const { data, setData, error, loading, reload } = useApi<AdminPosterRow[]>(`/admin/posters?kind=${kind}`)
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data ?? []).filter((s) => !needle || s.title.toLowerCase().includes(needle)).slice(0, 120)
  }, [data, q])

  return (
    <div className="slist">
      <div className="admin__head slist__head">
        <div>
          <h1>Posters</h1>
          <p className="muted small">
            {kind === 'designed'
              ? 'These series have a poster we designed from their episodes. Find the official one on Google Images, long-press it (or right-click) → Copy image address, paste it below and save.'
              : 'Series that already have their official poster.'}
          </p>
        </div>
      </div>

      <div className="toolbar slist__toolbar">
        <div className="seg">
          <button className={kind === 'designed' ? 'on' : ''} onClick={() => setKind('designed')}>
            Needs official poster
          </button>
          <button className={kind === 'official' ? 'on' : ''} onClick={() => setKind('official')}>
            Official
          </button>
        </div>
        <input className="input input--small" placeholder="Search titles…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{data ? `${data.length.toLocaleString()} series` : ''}</span>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || loading ? (
        <Spinner />
      ) : (
        <div className="poster-grid">
          {shown.map((s) => (
            <PosterCard key={s.id} s={s} onSaved={() => setData((list) => (kind === 'designed' ? list?.filter((x) => x.id !== s.id) : list))} />
          ))}
          {shown.length === 0 && <p className="muted">Nothing here.</p>}
        </div>
      )}
      {data && data.length > shown.length && !q && <p className="muted small">Showing the 120 most-watched. Search to find others.</p>}
    </div>
  )
}

function PosterCard({ s, onSaved }: { s: AdminPosterRow; onSaved: () => void }) {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [poster, setPoster] = useState(s.posterUrl)

  const save = async () => {
    if (!url.trim()) return
    setBusy(true)
    try {
      const updated = await api.post<{ posterUrl: string | null }>(`/admin/series/${encodeURIComponent(s.id)}/poster-url`, { url })
      setPoster(updated.posterUrl)
      setUrl('')
      toast(`Poster updated: ${s.title}`)
      setTimeout(onSaved, 1200)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="poster-card">
      <div className="poster-card__img">{poster ? <img src={poster} alt="" loading="lazy" /> : <span className="muted small">No image</span>}</div>
      <div className="poster-card__body">
        <Link to={`/admin/series/${encodeURIComponent(s.id)}`} className="poster-card__title">
          {s.title}
        </Link>
        <span className="muted small">
          {s.genres[0] ?? 'Drama'} · {s.episodeCount} eps{s.views30d ? ` · ${s.views30d.toLocaleString()} views` : ''}
        </span>
        <a className="btn btn--secondary btn--small" href={googleImages(s.title)} target="_blank" rel="noopener noreferrer">
          Find on Google
        </a>
        <input
          className="input input--small"
          placeholder="Paste image address"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="btn btn--accent btn--small" disabled={busy || !url.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save poster'}
        </button>
      </div>
    </div>
  )
}
