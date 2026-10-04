import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { SeriesSummary } from '../../shared/types'
import { useSession } from '../state/Session'
import { useRetryImage } from './useRetryImage'

interface Props {
  series: SeriesSummary
  rank?: number
  /** Link to resume playback instead of the series page. */
  resume?: boolean
  /** Show the New badge even if the series isn't flagged new. */
  fresh?: boolean
}

/** A cover with the title and a short meta line underneath, like a store shelf rather than a wall of posters. */
export default function SeriesCard({ series, rank, resume, fresh }: Props) {
  const { progress } = useSession()
  const p = progress[series.id]
  const to = resume && p ? `/watch/${series.id}/${p.episodeNumber}` : `/title/${series.id}`
  const pct = p ? Math.min(100, Math.round((p.episodeNumber / Math.max(series.episodeCount, 1)) * 100)) : 0
  const { url: image, key, onError } = useRetryImage(series.posterUrl)

  return (
    <Link
      to={to}
      className={`scard ${rank !== undefined ? 'scard--ranked' : ''}`}
      style={{ '--glow': series.palette[0] === '#111111' || series.palette[0] === '#18181b' ? series.palette[1] : series.palette[0] } as CSSProperties}
    >
      {rank !== undefined && (
        <span className="scard__rank" aria-label={`Number ${rank}`}>
          {rank}
        </span>
      )}
      <div className="scard__cover" style={{ background: `linear-gradient(170deg, color-mix(in srgb, ${series.palette[0]} 45%, #18181b), #0d0d0f)` }}>
        {image ? (
          <img key={key} src={image} alt="" loading="lazy" onError={onError} />
        ) : (
          <span className="scard__fallback">{series.title}</span>
        )}
        {(fresh || series.isNew) && !resume && <span className="scard__badge">New</span>}
        {resume && p && (
          <div className="scard__progress" aria-label={`Episode ${p.episodeNumber} of ${series.episodeCount}`}>
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="scard__body">
        <h3 className="scard__title">{series.title}</h3>
        <p className="scard__meta">
          {resume && p ? `Episode ${p.episodeNumber} of ${series.episodeCount}` : `${series.genres[0] ?? 'Drama'} · ${series.episodeCount} episodes`}
        </p>
      </div>
    </Link>
  )
}
