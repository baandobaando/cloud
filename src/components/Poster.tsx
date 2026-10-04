import type { SeriesSummary } from '../../shared/types'

interface Props {
  series: Pick<SeriesSummary, 'title' | 'palette' | 'emoji' | 'isNew' | 'posterUrl'>
  /** "portrait" for 2:3 cards, "wide" for hero / backdrop art. */
  variant?: 'portrait' | 'wide'
  showTitle?: boolean
}

/** Uploaded poster art when available, otherwise generated art from the series palette. */
export default function Poster({ series, variant = 'portrait', showTitle = true }: Props) {
  const [from, to] = series.palette
  return (
    <div
      className={`poster poster--${variant}`}
      style={{ background: `radial-gradient(circle at 30% 20%, ${from} 0%, transparent 60%), linear-gradient(160deg, ${from}, ${to})` }}
    >
      {series.posterUrl ? (
        <img className="poster__img" src={series.posterUrl} alt="" loading="lazy" />
      ) : (
        <span className="poster__emoji" aria-hidden>
          {series.emoji}
        </span>
      )}
      {series.isNew && <span className="poster__badge">NEW</span>}
      {showTitle && !series.posterUrl && <span className="poster__title">{series.title}</span>}
    </div>
  )
}
