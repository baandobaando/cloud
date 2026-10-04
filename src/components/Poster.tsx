import type { CSSProperties } from 'react'
import type { SeriesSummary } from '../../shared/types'

interface Props {
  series: Pick<SeriesSummary, 'title' | 'palette' | 'isNew' | 'posterUrl' | 'genres'>
  /** "portrait" for 2:3 cards, "wide" for hero / backdrop art. */
  variant?: 'portrait' | 'wide'
  showTitle?: boolean
}

/** Uploaded poster art when available, otherwise typographic art from the series palette. */
export default function Poster({ series, variant = 'portrait', showTitle = true }: Props) {
  const [c1, c2] = series.palette
  return (
    <div className={`poster poster--${variant}`} style={{ '--c1': c1, '--c2': c2 } as CSSProperties}>
      {series.posterUrl ? (
        <img className="poster__img" src={series.posterUrl} alt="" loading="lazy" />
      ) : (
        showTitle && (
          <>
            {series.genres[0] && <span className="poster__genre">{series.genres[0]}</span>}
            <span className="poster__title">{series.title}</span>
          </>
        )
      )}
      {series.isNew && <span className="poster__badge">New</span>}
    </div>
  )
}
