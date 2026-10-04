import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../api'
import { useToast } from '../components/Toast'
import Icon from '../components/Icon'

export interface BunnyStatus {
  configured: boolean
  lastSync?: { at: number; ok: boolean; created: number; updated: number; episodes: number; pending: number; error?: string } | null
  collections?: number
  videos?: number
  storageGb?: number
  linkedSeries?: number
  hiddenSeries?: number
  autoSync?: boolean
  syncMinutes?: number
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
    action: 'created' | 'updated' | 'unchanged' | 'skipped'
    episodes: number
    pending: number
    missing: number[]
    note?: string
  }[]
}

export function timeAgo(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

interface Props {
  status: BunnyStatus | null
  error: string | null
  reload: () => void
  onImported: () => void
}

/** Pulls every Bunny Stream collection into the catalog as a series. */
export default function BunnyImport({ status, error, reload, onImported }: Props) {
  const toast = useToast()
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

  const restore = async () => {
    setBusy(true)
    try {
      const r = await api.post<ImportResult>('/admin/bunny/restore')
      setResult(r)
      toast(`Restored deleted series · ${r.episodes.toLocaleString()} episodes synced`, 'success')
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
            {!!status.hiddenSeries && ` · ${status.hiddenSeries} deleted from the site`}
          </p>
        </div>
        <div className="admin__actions">
          <label className="check">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publish new series right away
          </label>
          {!!status.hiddenSeries && (
            <button className="btn btn--secondary btn--small" disabled={busy} onClick={restore}>
              Restore {status.hiddenSeries} deleted
            </button>
          )}
          <button className="btn btn--accent btn--small" disabled={busy} onClick={run}>
            <Icon name="refresh" size={16} /> {busy ? 'Importing… this can take a minute' : 'Import from Bunny'}
          </button>
        </div>
      </div>
      {status.lastSync && (
        <p className={`small bunny__last ${status.lastSync.ok ? '' : 'bunny__last--bad'}`}>
          <span className="dot" /> Last sync {timeAgo(status.lastSync.at)}
          {status.lastSync.ok
            ? ` · ${status.lastSync.created} new, ${status.lastSync.updated} updated, ${status.lastSync.episodes.toLocaleString()} episodes${status.lastSync.pending ? `, ${status.lastSync.pending} still processing` : ''}`
            : ` failed: ${status.lastSync.error}`}
        </p>
      )}
      <p className="muted small">
        {status.autoSync
          ? `The site syncs with Bunny automatically every ${status.syncMinutes} minute${status.syncMinutes === 1 ? '' : 's'}; use the button to sync right now.`
          : 'Automatic sync is off; use the button to sync.'}{' '}
        Each collection becomes a series and each finished video an episode, ordered by the number in its title.
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
