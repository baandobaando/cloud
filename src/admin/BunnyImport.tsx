import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../api'
import { useApi } from '../useApi'
import { useToast } from '../components/Toast'
import Icon from '../components/Icon'

interface Status {
  configured: boolean
  collections?: number
  videos?: number
  storageGb?: number
  linkedSeries?: number
}

interface ImportResult {
  created: number
  updated: number
  skipped: number
  episodes: number
  pending: number
  report: {
    collection: string
    seriesId: string
    action: 'created' | 'updated' | 'skipped'
    episodes: number
    pending: number
    missing: number[]
    note?: string
  }[]
}

/** Pulls every Bunny Stream collection into the catalog as a series. */
export default function BunnyImport({ onImported }: { onImported: () => void }) {
  const toast = useToast()
  const { data: status, error, reload } = useApi<Status>('/admin/bunny/status')
  const [publish, setPublish] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  if (error) return <div className="notice">Couldn't reach Bunny Stream: {error}</div>
  if (!status) return null
  if (!status.configured) {
    return (
      <div className="notice">
        Connect Bunny Stream by setting <code>BUNNY_LIBRARY_ID</code>, <code>BUNNY_LIBRARY_KEY</code> and{' '}
        <code>BUNNY_CDN_HOST</code> on the server.
      </div>
    )
  }

  const run = async () => {
    setBusy(true)
    try {
      const r = await api.post<ImportResult>('/admin/bunny/import', { publish })
      setResult(r)
      toast(`Imported ${r.episodes.toLocaleString()} episodes across ${r.created + r.updated} series`, 'success')
      onImported()
      reload()
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const attention = result?.report.filter((r) => r.action === 'skipped' || r.missing.length > 0 || r.pending > 0) ?? []

  return (
    <section className="panel bunny">
      <div className="admin__head">
        <div>
          <h2>Bunny Stream library</h2>
          <p className="muted small">
            {status.collections} collections · {status.videos?.toLocaleString()} videos · {status.storageGb} GB ·{' '}
            {status.linkedSeries} linked to series
          </p>
        </div>
        <div className="admin__actions">
          <label className="check">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publish new series right away
          </label>
          <button className="btn btn--accent btn--small" disabled={busy} onClick={run}>
            <Icon name="refresh" size={16} /> {busy ? 'Importing… this can take a minute' : 'Import from Bunny'}
          </button>
        </div>
      </div>
      <p className="muted small">
        Each collection becomes a series and each finished video an episode, ordered by the number in its title. Run it
        again any time to pick up newly finished uploads. Episode lists of imported series are managed by Bunny.
      </p>
      {result && (
        <div className="bunny__result">
          <strong>
            {result.created} new · {result.updated} updated · {result.skipped} skipped · {result.episodes.toLocaleString()} episodes
            {result.pending > 0 && ` · ${result.pending} still processing`}
          </strong>
          {attention.length > 0 && (
            <ul>
              {attention.slice(0, 30).map((r) => (
                <li key={r.collection}>
                  {r.seriesId ? <Link to={`/admin/series/${r.seriesId}`}>{r.collection}</Link> : r.collection}
                  <span className="muted small">
                    {' '}
                    {r.note ?? ''}
                    {r.pending > 0 && ` ${r.pending} processing.`}
                    {r.missing.length > 0 && ` Missing episode${r.missing.length > 1 ? 's' : ''} ${r.missing.slice(0, 8).join(', ')}${r.missing.length > 8 ? '…' : ''}.`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
