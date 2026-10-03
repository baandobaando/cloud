import type { Series } from '../data/catalog'

interface Props {
  series: Series
  /** "portrait" for 2:3 cards, "wide" for hero / backdrop art. */
  variant?: 'portrait' | 'wide'
  showTitle?: boolean
}

/** Generated poster art, so the catalog needs no image assets. */
export default function Poster({ series, variant = 'portrait', showTitle = true }: Props) {
  const [from, to] = series.palette
  return (
    <div
      className={`poster poster--${variant}`}
      style={{ background: `radial-gradient(circle at 30% 20%, ${from} 0%, transparent 60%), linear-gradient(160deg, ${from}, ${to})` }}
    >
      <span className="poster__emoji" aria-hidden>
        {series.emoji}
      </span>
      {series.isNew && <span className="poster__badge">NEW</span>}
      {showTitle && <span className="poster__title">{series.title}</span>}
    </div>
  )
}
