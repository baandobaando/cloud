import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SeriesSummary } from '../../shared/types'
import { useSession } from '../state/Session'

interface Props {
  series: SeriesSummary
  rank?: number
  /** Link to resume playback instead of the series page. */
  resume?: boolean
}

/** A cover with the title and a short meta line underneath, like a store shelf rather than a wall of posters. */
export default function SeriesCard({ series, rank, resume }: Props) {
  const { progress } = useSession()
  const [failed, setFailed] = useState(false)
  const p = progress[series.id]
  const to = resume && p ? `/watch/${series.id}/${p.episodeNumber}` : `/title/${series.id}`
  const pct = p ? Math.min(100, Math.round((p.episodeNumber / Math.max(series.episodeCount, 1)) * 100)) : 0
  const image = series.posterUrl && !failed ? series.posterUrl : null

  return (
    <Link to={to} className="scard">
      <div className="scard__cover" style={{ background: `linear-gradient(170deg, color-mix(in srgb, ${series.palette[0]} 30%, #18181b), #0d0d0f)` }}>
        {image ? (
          <img src={image} alt="" loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <span className="scard__fallback">{series.title}</span>
        )}
        {rank !== undefined && <span className="scard__rank">{rank}</span>}
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
