import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  GENRES,
  RATINGS,
  type AdminEpisode,
  type AdminSeriesDetail,
  type Genre,
  type SeriesInput,
} from '../../shared/types'
import { api, errorMessage, upload } from '../api'
import { useApi } from '../useApi'
import Poster from '../components/Poster'
import { ErrorState, Spinner } from '../components/Feedback'
import { useToast } from '../components/Toast'
import { useDialog } from '../components/Dialog'

const EMPTY: SeriesInput = {
  title: '',
  tagline: '',
  synopsis: '',
  genres: [],
  year: new Date().getFullYear(),
  rating: 'TV-14',
  palette: ['#7a0f2e', '#1a0b2e'],
  emoji: '🎬',
  isNew: true,
  trendingRank: null,
  freeEpisodes: 5,
  published: false,
}

function toInput(s: AdminSeriesDetail): SeriesInput {
  const { title, tagline, synopsis, genres, year, rating, palette, emoji, isNew, trendingRank, freeEpisodes, published } = s
  return { title, tagline, synopsis, genres, year, rating, palette, emoji, isNew, trendingRank, freeEpisodes, published }
}

/** Reads a local video file's duration in the browser before uploading. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : null)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    v.src = url
  })
}

function videoForm(file: File, duration: number | null): FormData {
  const form = new FormData()
  if (duration) form.append('durationSec', String(duration))
  form.append('file', file)
  return form
}

export default function SeriesEditor() {
  const { seriesId } = useParams()
  const isNew = !seriesId
  const navigate = useNavigate()
  const toast = useToast()
  const dialog = useDialog()
  const { data: loaded, setData: setLoaded, error, reload } = useApi<AdminSeriesDetail>(
    isNew ? null : `/admin/series/${encodeURIComponent(seriesId)}`,
  )
  const [form, setForm] = useState<SeriesInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (loaded) {
      setForm(toInput(loaded))
      setDirty(false)
    }
  }, [loaded])

  useEffect(() => {
    if (isNew) setForm(EMPTY)
  }, [isNew])

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!isNew && !loaded) return <Spinner />

  const set = <K extends keyof SeriesInput>(key: K, value: SeriesInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  const toggleGenre = (g: Genre) =>
    set('genres', form.genres.includes(g) ? form.genres.filter((x) => x !== g) : [...form.genres, g])

  const save = async (e?: FormEvent, overrides: Partial<SeriesInput> = {}) => {
    e?.preventDefault()
    setSaving(true)
    try {
      const body = { ...form, ...overrides }
      if (isNew) {
        const created = await api.post<AdminSeriesDetail>('/admin/series', body)
        toast('Series created. Now add episodes.', 'success')
        navigate(`/admin/series/${created.id}`, { replace: true })
      } else {
        const updated = await api.patch<AdminSeriesDetail>(`/admin/series/${encodeURIComponent(seriesId)}`, body)
        setLoaded(updated)
        toast('Saved', 'success')
      }
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!loaded) return
    const typed = await dialog.prompt({
      title: `Delete “${loaded.title}”?`,
      message: `This permanently deletes the series, all ${loaded.episodes.length} episodes and their uploaded videos. Type DELETE to confirm.`,
      requireText: 'DELETE',
      confirmLabel: 'Delete series',
      danger: true,
    })
    if (typed !== 'DELETE') return
    try {
      await api.del(`/admin/series/${encodeURIComponent(loaded.id)}`)
      toast('Series deleted', 'success')
      navigate('/admin/series', { replace: true })
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const preview = { ...form, posterUrl: loaded?.posterUrl ?? null }

  return (
    <>
      <div className="admin__head">
        <div>
          <Link to="/admin/series" className="link small">← All series</Link>
          <h1>{isNew ? 'New series' : form.title || 'Untitled'}</h1>
        </div>
        <div className="admin__actions">
          {loaded?.published && (
            <Link to={`/title/${loaded.id}`} className="btn btn--grey btn--small">
              View in app
            </Link>
          )}
          {!isNew && (
            <button
              className={`btn btn--small ${form.published ? 'btn--grey' : 'btn--white'}`}
              disabled={saving}
              onClick={() => {
                const published = !form.published
                set('published', published)
                save(undefined, { published })
              }}
            >
              {form.published ? 'Unpublish' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      <form className="editor" onSubmit={save}>
        <div className="editor__fields panel">
          <label className="field">
            <span>Title</span>
            <input className="input" required maxLength={120} value={form.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="field">
            <span>Tagline</span>
            <input className="input" maxLength={200} value={form.tagline} placeholder="One punchy line for the banner" onChange={(e) => set('tagline', e.target.value)} />
          </label>
          <label className="field">
            <span>Synopsis</span>
            <textarea className="input" rows={4} maxLength={2000} value={form.synopsis} onChange={(e) => set('synopsis', e.target.value)} />
          </label>
          <div className="field">
            <span>Genres</span>
            <div className="chips">
              {GENRES.map((g) => (
                <button type="button" key={g} className={`chip ${form.genres.includes(g) ? 'chip--on' : ''}`} onClick={() => toggleGenre(g)}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Year</span>
              <input className="input" type="number" min={1900} max={2100} value={form.year} onChange={(e) => set('year', Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Rating</span>
              <select className="input" value={form.rating} onChange={(e) => set('rating', e.target.value as SeriesInput['rating'])}>
                {RATINGS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Free episodes</span>
              <input className="input" type="number" min={0} max={1000} value={form.freeEpisodes} onChange={(e) => set('freeEpisodes', Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Trending rank</span>
              <input
                className="input"
                type="number"
                min={1}
                max={100}
                placeholder="—"
                value={form.trendingRank ?? ''}
                onChange={(e) => set('trendingRank', e.target.value ? Number(e.target.value) : null)}
              />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.isNew} onChange={(e) => set('isNew', e.target.checked)} />
            Show “NEW” badge
          </label>
          <div className="editor__save">
            <button className="btn btn--red" disabled={saving || (!dirty && !isNew)}>
              {saving ? 'Saving…' : isNew ? 'Create series' : dirty ? 'Save changes' : 'Saved'}
            </button>
            {!isNew && (
              <button type="button" className="btn btn--link danger" onClick={remove}>
                Delete series
              </button>
            )}
          </div>
        </div>

        <div className="editor__art panel">
          <span className="field__label">Poster</span>
          <div className="editor__poster">
            <Poster series={preview} />
          </div>
          {loaded ? (
            <PosterUpload series={loaded} onChange={setLoaded} />
          ) : (
            <p className="muted small">Save the series to upload poster art.</p>
          )}
          {!loaded?.posterUrl && (
            <>
              <p className="muted small">Or use generated art:</p>
              <div className="field-row">
                <label className="field">
                  <span>Emoji</span>
                  <input className="input" maxLength={16} value={form.emoji} onChange={(e) => set('emoji', e.target.value)} />
                </label>
                <label className="field">
                  <span>Color 1</span>
                  <input className="input input--color" type="color" value={form.palette[0]} onChange={(e) => set('palette', [e.target.value, form.palette[1]])} />
                </label>
                <label className="field">
                  <span>Color 2</span>
                  <input className="input input--color" type="color" value={form.palette[1]} onChange={(e) => set('palette', [form.palette[0], e.target.value])} />
                </label>
              </div>
            </>
          )}
        </div>
      </form>

      {loaded && <Episodes series={loaded} onChange={setLoaded} />}
    </>
  )
}

function PosterUpload({ series, onChange }: { series: AdminSeriesDetail; onChange: (s: AdminSeriesDetail) => void }) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    const form = new FormData()
    form.append('file', file)
    try {
      onChange(await upload<AdminSeriesDetail>(`/admin/series/${encodeURIComponent(series.id)}/poster`, form))
      toast('Poster updated', 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="admin__actions">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" className="btn btn--grey btn--small" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : series.posterUrl ? 'Replace image' : 'Upload image'}
      </button>
      {series.posterUrl && (
        <button
          type="button"
          className="btn btn--link small"
          onClick={async () => {
            try {
              onChange(await api.del<AdminSeriesDetail>(`/admin/series/${encodeURIComponent(series.id)}/poster`))
            } catch (err) {
              toast(errorMessage(err), 'error')
            }
          }}
        >
          Remove
        </button>
      )}
      <span className="muted small">2:3 portrait, JPG/PNG/WebP, max 10 MB</span>
    </div>
  )
}

interface UploadJob {
  name: string
  pct: number
  error?: string
}

function Episodes({ series, onChange }: { series: AdminSeriesDetail; onChange: (s: AdminSeriesDetail) => void }) {
  const toast = useToast()
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const bulkInput = useRef<HTMLInputElement>(null)
  const base = `/admin/series/${encodeURIComponent(series.id)}`
  const missing = series.episodes.filter((e) => !e.videoUrl).length

  const addEmpty = async () => {
    setBusy(true)
    try {
      onChange(await api.post<AdminSeriesDetail>(`${base}/episodes`, { count }))
      toast(`Added ${count} episode${count > 1 ? 's' : ''}`, 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Creates one new episode per file (in filename order) and uploads each video. */
  const bulkUpload = async (files: FileList | null) => {
    if (!files?.length) return
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    setJobs(sorted.map((f) => ({ name: f.name, pct: 0 })))
    setBusy(true)
    let latest = series
    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i]
      const update = (patch: Partial<UploadJob>) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)))
      try {
        const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120)
        latest = await api.post<AdminSeriesDetail>(`${base}/episodes`, { count: 1, title })
        const ep = latest.episodes[latest.episodes.length - 1]
        const duration = await readDuration(file)
        latest = await upload<AdminSeriesDetail>(`/admin/episodes/${ep.id}/video`, videoForm(file, duration), (pct) => update({ pct }))
        update({ pct: 100 })
        onChange(latest)
      } catch (err) {
        update({ error: errorMessage(err) })
      }
    }
    setBusy(false)
    if (bulkInput.current) bulkInput.current.value = ''
    toast('Upload finished', 'success')
  }

  return (
    <section className="panel">
      <div className="admin__head">
        <div>
          <h2>Episodes ({series.episodes.length})</h2>
          <p className="muted small">
            Episodes 1–{series.freeEpisodes} are free; the rest need a membership.
            {missing > 0 && <strong className="warn"> {missing} episode{missing > 1 ? 's have' : ' has'} no video yet.</strong>}
          </p>
        </div>
        <div className="admin__actions">
          <input ref={bulkInput} type="file" accept="video/mp4,video/webm,video/quicktime" multiple hidden onChange={(e) => bulkUpload(e.target.files)} />
          <button className="btn btn--red btn--small" disabled={busy} onClick={() => bulkInput.current?.click()}>
            ⬆ Upload videos as new episodes
          </button>
          <input className="input input--tiny" type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} aria-label="Number of episodes" />
          <button className="btn btn--grey btn--small" disabled={busy} onClick={addEmpty}>
            + Add empty
          </button>
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="jobs">
          {jobs.map((j, i) => (
            <div key={i} className="job">
              <span className="job__name">{j.name}</span>
              {j.error ? <span className="danger small">{j.error}</span> : (
                <div className="bar"><div style={{ width: `${j.pct}%` }} /></div>
              )}
              <span className="small muted">{j.error ? '✕' : j.pct === 100 ? '✓' : `${j.pct}%`}</span>
            </div>
          ))}
          {!busy && <button className="btn btn--link small" onClick={() => setJobs([])}>Clear</button>}
        </div>
      )}

      {series.episodes.length === 0 ? (
        <p className="muted">No episodes yet. Upload videos (named so they sort in order, e.g. <code>ep01.mp4</code>, <code>ep02.mp4</code>) or add empty episodes and link videos later.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th className="num">#</th><th>Title</th><th>Video</th><th className="num">Length</th><th /></tr>
          </thead>
          <tbody>
            {series.episodes.map((ep) => (
              <EpisodeRow key={ep.id} ep={ep} free={ep.number <= series.freeEpisodes} isLast={ep.number === series.episodes.length} onChange={onChange} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function EpisodeRow({ ep, free, isLast, onChange }: { ep: AdminEpisode; free: boolean; isLast: boolean; onChange: (s: AdminSeriesDetail) => void }) {
  const toast = useToast()
  const dialog = useDialog()
  const [title, setTitle] = useState(ep.title)
  const [editingUrl, setEditingUrl] = useState(false)
  const [url, setUrl] = useState(ep.videoUrl ?? '')
  const [pct, setPct] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(ep.title)
    setUrl(ep.videoUrl ?? '')
  }, [ep.title, ep.videoUrl])

  const patch = async (changes: Partial<AdminEpisode>) => {
    try {
      onChange(
        await api.patch<AdminSeriesDetail>(`/admin/episodes/${ep.id}`, {
          title: ep.title,
          durationSec: ep.durationSec,
          videoUrl: ep.videoUrl,
          ...changes,
        }),
      )
      return true
    } catch (err) {
      toast(errorMessage(err), 'error')
      return false
    }
  }

  const uploadVideo = async (file: File | undefined) => {
    if (!file) return
    setPct(0)
    try {
      const duration = await readDuration(file)
      onChange(await upload<AdminSeriesDetail>(`/admin/episodes/${ep.id}/video`, videoForm(file, duration), setPct))
      toast(`Episode ${ep.number} video uploaded`, 'success')
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setPct(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const act = async (fn: () => Promise<AdminSeriesDetail>) => {
    try {
      onChange(await fn())
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const isUploaded = ep.videoUrl?.startsWith('/media/')

  return (
    <tr>
      <td className="num">
        <strong>{ep.number}</strong>
        {free && <div className="pill pill--tiny">free</div>}
      </td>
      <td>
        <input
          className="input input--bare"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== ep.title && patch({ title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={`Episode ${ep.number} title`}
        />
      </td>
      <td className="ep-video">
        {pct !== null ? (
          <div className="bar"><div style={{ width: `${pct}%` }} /></div>
        ) : editingUrl ? (
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await patch({ videoUrl: url.trim() || null })) setEditingUrl(false)
            }}
          >
            <input className="input input--small" autoFocus placeholder="https://…/episode.mp4" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn btn--white btn--small">Save</button>
            <button type="button" className="btn btn--link small" onClick={() => setEditingUrl(false)}>Cancel</button>
          </form>
        ) : (
          <>
            {ep.videoUrl ? (
              <a href={ep.videoUrl} target="_blank" rel="noreferrer" className="status status--paid">
                {isUploaded ? 'Uploaded' : 'Linked'} ↗
              </a>
            ) : (
              <span className="status status--failed">Missing</span>
            )}
            <input ref={fileInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => uploadVideo(e.target.files?.[0])} />
            <button className="btn btn--link small" onClick={() => fileInput.current?.click()}>Upload</button>
            <button className="btn btn--link small" onClick={() => setEditingUrl(true)}>Link URL</button>
          </>
        )}
      </td>
      <td className="num muted">{Math.floor(ep.durationSec / 60)}:{String(ep.durationSec % 60).padStart(2, '0')}</td>
      <td className="row-actions">
        <button className="icon-btn icon-btn--small" disabled={ep.number === 1} title="Move up" onClick={() => act(() => api.post(`/admin/episodes/${ep.id}/move`, { direction: 'up' }))}>↑</button>
        <button className="icon-btn icon-btn--small" disabled={isLast} title="Move down" onClick={() => act(() => api.post(`/admin/episodes/${ep.id}/move`, { direction: 'down' }))}>↓</button>
        <button
          className="icon-btn icon-btn--small"
          title="Delete episode"
          onClick={async () => {
            const ok = await dialog.confirm({
              title: `Delete episode ${ep.number}?`,
              message: `“${ep.title}” will be removed and later episodes renumbered.`,
              confirmLabel: 'Delete episode',
              danger: true,
            })
            if (ok) act(() => api.del(`/admin/episodes/${ep.id}`))
          }}
        >
          🗑
        </button>
      </td>
    </tr>
  )
}
