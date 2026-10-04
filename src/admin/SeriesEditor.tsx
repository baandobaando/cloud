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
import Icon from '../components/Icon'
import { useVideoSource } from '../useVideoSource'
import { Drawer } from './ui'
import { usePageTitle } from '../usePageTitle'

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
  usePageTitle(isNew ? 'Admin · New series' : loaded ? `Admin · ${loaded.title}` : 'Admin · Series')
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

  // Warn before closing or reloading the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!isNew && !loaded) return <Spinner />

  const set = <K extends keyof SeriesInput>(key: K, value: SeriesInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  const toggleGenre = (g: Genre) =>
    set('genres', form.genres.includes(g) ? form.genres.filter((x) => x !== g) : [...form.genres, g])

  /** Saves the form (plus any overrides); resolves to whether it worked. */
  const save = async (e?: FormEvent, overrides: Partial<SeriesInput> = {}): Promise<boolean> => {
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
      return true
    } catch (err) {
      toast(errorMessage(err), 'error')
      return false
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
          <Link
            to="/admin/series"
            className="link small"
            onClick={async (e) => {
              if (!dirty) return
              e.preventDefault()
              if (await dialog.confirm({ title: 'Leave without saving?', message: 'Your changes to this series will be lost.', confirmLabel: 'Leave', danger: true })) navigate('/admin/series')
            }}
          >
            ← All series
          </Link>
          <h1>{isNew ? 'New series' : form.title || 'Untitled'}</h1>
        </div>
        <div className="admin__actions">
          {loaded?.published && (
            <Link to={`/title/${loaded.id}`} className="btn btn--secondary btn--small">
              View in app
            </Link>
          )}
          {!isNew && (
            <button
              className={`btn btn--small ${form.published ? 'btn--secondary' : 'btn--primary'}`}
              disabled={saving}
              onClick={async () => {
                const published = !form.published
                set('published', published)
                // Roll the toggle back if the save is rejected (e.g. a required field is missing).
                if (!(await save(undefined, { published }))) setForm((f) => ({ ...f, published: !published }))
              }}
            >
              {form.published ? 'Unpublish' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {loaded && <SeriesStats series={loaded} />}

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
              {loaded && form.freeEpisodes > loaded.episodes.length && (
                <small className="warn">More than the {loaded.episodes.length} episodes this series has: everything is free.</small>
              )}
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
            <button className="btn btn--accent" disabled={saving || (!dirty && !isNew)}>
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
              <p className="muted small">No image? The poster is generated from the title and these two colors:</p>
              <div className="field-row">
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
      <button type="button" className="btn btn--secondary btn--small" disabled={busy} onClick={() => input.current?.click()}>
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

const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`
const hoursOrMin = (sec: number) => (sec >= 3600 ? `${(sec / 3600).toFixed(1)} h` : `${Math.round(sec / 60)} min`)

/** At-a-glance numbers for one series. */
function SeriesStats({ series }: { series: AdminSeriesDetail }) {
  const missing = series.episodes.filter((e) => !e.videoUrl).length
  const items: { label: string; value: string; warn?: boolean }[] = [
    { label: 'Episodes', value: String(series.episodes.length) },
    { label: 'Runtime', value: hoursOrMin(series.runtimeSec ?? 0) },
    { label: 'Free', value: `${Math.min(series.freeEpisodes, series.episodes.length)}` },
    { label: 'Missing video', value: String(missing), warn: missing > 0 },
    { label: 'Views (30d)', value: (series.views30d ?? 0).toLocaleString() },
    { label: 'Viewers (30d)', value: (series.viewers30d ?? 0).toLocaleString() },
    { label: 'Source', value: series.source === 'bunny' ? 'Bunny sync' : 'Manual' },
  ]
  return (
    <div className="estats">
      {items.map((i) => (
        <div key={i.label} className={`estats__item ${i.warn ? 'estats__item--warn' : ''}`}>
          <strong>{i.value}</strong>
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Views per episode over 30 days: where people stop watching, and where the paywall bites. */
function DropOff({ series }: { series: AdminSeriesDetail }) {
  const views = series.episodeViews30d ?? {}
  const eps = series.episodes
  const max = Math.max(1, ...eps.map((e) => views[e.number] ?? 0))
  const first = views[1] ?? 0
  if (!eps.length || !Object.keys(views).length) return <p className="muted small">No views in the last 30 days yet. Once people watch, this shows where they stop.</p>
  const lastFree = series.freeEpisodes
  const afterPaywall = views[lastFree + 1] ?? 0
  return (
    <div className="dropoff">
      <div className="dropoff__bars" role="img" aria-label="Views per episode">
        {eps.map((e) => {
          const v = views[e.number] ?? 0
          return (
            <div
              key={e.id}
              className={`dropoff__bar ${e.number <= lastFree ? 'is-free' : ''}`}
              style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
              title={`Episode ${e.number}: ${v} views${first ? ` · ${Math.round((v / first) * 100)}% of episode 1` : ''}`}
            />
          )
        })}
      </div>
      <p className="muted small">
        Episode 1: {first} views · last free episode ({lastFree}): {views[lastFree] ?? 0}
        {lastFree < eps.length && ` · first paid episode: ${afterPaywall}`}
        {first > 0 && ` · ${Math.round(((views[eps.length] ?? 0) / first) * 100)}% reach the final episode`}. Hover a bar for details; red bars are free episodes.
      </p>
    </div>
  )
}

/** Plays an episode inside the editor (HLS for Bunny videos). */
function PreviewModal({ ep, onClose }: { ep: AdminEpisode; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  useVideoSource(ref, ep.videoUrl, () => ref.current?.play().catch(() => {}))
  return (
    <Drawer title={<h2>Episode {ep.number}</h2>} onClose={onClose}>
      <video ref={ref} className="preview-video" controls playsInline autoPlay />
      <p className="muted small">{ep.title} · {fmtTime(ep.durationSec)}</p>
    </Drawer>
  )
}

function Episodes({ series, onChange }: { series: AdminSeriesDetail; onChange: (s: AdminSeriesDetail) => void }) {
  const toast = useToast()
  const dialog = useDialog()
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<AdminEpisode | null>(null)
  const [showMissing, setShowMissing] = useState(false)
  const bulkInput = useRef<HTMLInputElement>(null)
  const base = `/admin/series/${encodeURIComponent(series.id)}`
  const missing = series.episodes.filter((e) => !e.videoUrl).length
  const shown = showMissing ? series.episodes.filter((e) => !e.videoUrl) : series.episodes
  const allSelected = shown.length > 0 && shown.every((e) => selected.has(e.id))

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

  /** Creates one new episode per file (in filename order) and uploads each video; failed uploads leave nothing behind. */
  const bulkUpload = async (files: FileList | null) => {
    if (!files?.length) return
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    setJobs(sorted.map((f) => ({ name: f.name, pct: 0 })))
    setBusy(true)
    let ok = 0
    for (let i = 0; i < sorted.length; i++) {
      const file = sorted[i]
      const update = (patch: Partial<UploadJob>) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)))
      let createdId: number | null = null
      try {
        const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120)
        const withEp = await api.post<AdminSeriesDetail>(`${base}/episodes`, { count: 1, title })
        createdId = withEp.episodes[withEp.episodes.length - 1].id
        const duration = await readDuration(file)
        onChange(await upload<AdminSeriesDetail>(`/admin/episodes/${createdId}/video`, videoForm(file, duration), (pct) => update({ pct })))
        update({ pct: 100 })
        ok++
      } catch (err) {
        update({ error: errorMessage(err) })
        // Don't leave an empty "Missing" episode behind for a failed file.
        if (createdId !== null) await api.del<AdminSeriesDetail>(`/admin/episodes/${createdId}`).then(onChange).catch(() => {})
      }
    }
    setBusy(false)
    if (bulkInput.current) bulkInput.current.value = ''
    const failed = sorted.length - ok
    toast(failed ? `${ok} uploaded, ${failed} failed (see the list)` : `${ok} episode${ok === 1 ? '' : 's'} uploaded`, failed ? 'error' : 'success')
  }

  const deleteSelected = async () => {
    const eps = series.episodes.filter((e) => selected.has(e.id))
    if (!eps.length) return
    const ok = await dialog.confirm({
      title: `Delete ${eps.length} episode${eps.length > 1 ? 's' : ''}?`,
      message: `${series.source === 'bunny' ? "They won't come back on the next Bunny sync. " : ''}Later episodes are renumbered.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    let latest: AdminSeriesDetail | null = null
    // Highest numbers first so each delete's renumbering doesn't shift the ones still to go.
    for (const e of [...eps].sort((a, b) => b.number - a.number)) {
      try {
        latest = await api.del<AdminSeriesDetail>(`/admin/episodes/${e.id}`)
      } catch (err) {
        toast(errorMessage(err), 'error')
      }
    }
    if (latest) onChange(latest)
    setSelected(new Set())
    setBusy(false)
    toast(`Deleted ${eps.length} episode${eps.length > 1 ? 's' : ''}`, 'success')
  }

  return (
    <section className="panel">
      <div className="admin__head">
        <div>
          <h2>Episodes ({series.episodes.length})</h2>
          <p className="muted small">
            Episodes 1–{Math.min(series.freeEpisodes, series.episodes.length)} are free; the rest need a membership.
            {missing > 0 && <strong className="warn"> {missing} episode{missing > 1 ? 's have' : ' has'} no video yet.</strong>}
            {series.source === 'bunny' && ' New videos in this Bunny collection are added automatically.'}
            {!!series.removedFromBunny && ` ${series.removedFromBunny} removed here won't be re-added.`}
          </p>
        </div>
        <div className="admin__actions">
          <input ref={bulkInput} type="file" accept="video/mp4,video/webm,video/quicktime" multiple hidden onChange={(e) => bulkUpload(e.target.files)} />
          <button className="btn btn--accent btn--small" disabled={busy} onClick={() => bulkInput.current?.click()}>
            <Icon name="upload" size={16} /> Upload videos as new episodes
          </button>
          <input className="input input--tiny" type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} aria-label="Number of episodes" />
          <button className="btn btn--secondary btn--small" disabled={busy} onClick={addEmpty}>
            + Add empty
          </button>
        </div>
      </div>

      <div className="eview">
        <h3 className="field__label">Viewer drop-off (last 30 days)</h3>
        <DropOff series={series} />
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
        <>
          <div className="slist__bar">
            <label className="check small">
              <input type="checkbox" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} /> Only episodes without a video
            </label>
            {selected.size > 0 && (
              <div className="toolbar__selection">
                <span className="muted small">{selected.size} selected</span>
                <button className="btn btn--danger btn--small" disabled={busy} onClick={deleteSelected}>
                  <Icon name="trash" size={16} /> Delete selected
                </button>
                <button className="btn btn--link small" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="table__check">
                    <input
                      type="checkbox"
                      aria-label="Select all episodes"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(shown.map((e) => e.id)))}
                    />
                  </th>
                  <th className="num">#</th>
                  <th>Title</th>
                  <th>Video</th>
                  <th className="num">Length</th>
                  <th className="num">Views 30d</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((ep) => (
                  <EpisodeRow
                    key={ep.id}
                    ep={ep}
                    free={ep.number <= series.freeEpisodes}
                    isLast={ep.number === series.episodes.length}
                    views={series.episodeViews30d?.[ep.number] ?? 0}
                    selected={selected.has(ep.id)}
                    onSelect={() =>
                      setSelected((cur) => {
                        const next = new Set(cur)
                        if (next.has(ep.id)) next.delete(ep.id)
                        else next.add(ep.id)
                        return next
                      })
                    }
                    onPreview={() => setPreview(ep)}
                    onChange={onChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {preview && <PreviewModal ep={preview} onClose={() => setPreview(null)} />}
    </section>
  )
}

interface RowProps {
  ep: AdminEpisode
  free: boolean
  isLast: boolean
  views: number
  selected: boolean
  onSelect: () => void
  onPreview: () => void
  onChange: (s: AdminSeriesDetail) => void
}

function EpisodeRow({ ep, free, isLast, views, selected, onSelect, onPreview, onChange }: RowProps) {
  const toast = useToast()
  const dialog = useDialog()
  const [title, setTitle] = useState(ep.title)
  const [length, setLength] = useState(fmtTime(ep.durationSec))
  const [editingUrl, setEditingUrl] = useState(false)
  const [url, setUrl] = useState(ep.videoUrl ?? '')
  const [pct, setPct] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(ep.title)
    setUrl(ep.videoUrl ?? '')
    setLength(fmtTime(ep.durationSec))
  }, [ep.title, ep.videoUrl, ep.durationSec])

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

  /** Accepts "1:25" or plain seconds. */
  const saveLength = () => {
    const m = /^(?:(\d+):)?(\d{1,4})$/.exec(length.trim())
    const sec = m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN
    if (!Number.isFinite(sec) || sec < 1) {
      setLength(fmtTime(ep.durationSec))
      return toast('Enter a length like 1:25', 'error')
    }
    if (sec !== ep.durationSec) patch({ durationSec: sec })
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

  const source = !ep.videoUrl ? null : ep.videoUrl.startsWith('/media/') ? 'Uploaded' : ep.videoUrl.includes('b-cdn.net') ? 'Bunny' : 'Linked'

  return (
    <tr className={selected ? 'is-selected' : ''}>
      <td className="table__check">
        <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select episode ${ep.number}`} />
      </td>
      <td className="num">
        <strong>{ep.number}</strong>
        {free && <div className="tag tag--tiny">free</div>}
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
            <input className="input input--small" autoFocus placeholder="https://…/episode.mp4" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Video URL" />
            <button className="btn btn--primary btn--small">Save</button>
            <button type="button" className="btn btn--link small" onClick={() => setEditingUrl(false)}>Cancel</button>
          </form>
        ) : (
          <>
            {source ? (
              <button className="status status--paid status--btn" onClick={onPreview} title="Preview">
                ▶ {source}
              </button>
            ) : (
              <span className="status status--failed">Missing</span>
            )}
            <input ref={fileInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => uploadVideo(e.target.files?.[0])} />
            <button className="btn btn--link small" onClick={() => fileInput.current?.click()}>Upload</button>
            <button className="btn btn--link small" onClick={() => setEditingUrl(true)}>Link URL</button>
          </>
        )}
      </td>
      <td className="num">
        <input
          className="input input--bare input--len"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          onBlur={saveLength}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={`Episode ${ep.number} length`}
          title="Length (m:ss)"
        />
      </td>
      <td className="num muted">{views.toLocaleString()}</td>
      <td>
        <div className="row-actions">
          <button className="icon-btn icon-btn--small" disabled={ep.number === 1} title="Move up" onClick={() => act(() => api.post(`/admin/episodes/${ep.id}/move`, { direction: 'up' }))} aria-label="Move up"><Icon name="up" size={16} /></button>
          <button className="icon-btn icon-btn--small" disabled={isLast} title="Move down" onClick={() => act(() => api.post(`/admin/episodes/${ep.id}/move`, { direction: 'down' }))} aria-label="Move down"><Icon name="down" size={16} /></button>
          <button
            className="icon-btn icon-btn--small"
            title="Delete episode"
            aria-label={`Delete episode ${ep.number}`}
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
            <Icon name="trash" size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}
