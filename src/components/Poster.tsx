import { useState, type CSSProperties } from 'react'
import type { SeriesSummary } from '../../shared/types'

interface Props {
  series: Pick<SeriesSummary, 'title' | 'palette' | 'isNew' | 'posterUrl' | 'genres'>
  /** "portrait" for 2:3 cards, "wide" for hero / backdrop art. */
  variant?: 'portrait' | 'wide'
  showTitle?: boolean
}

/**
 * Poster image (an uploaded poster or the Bunny episode thumbnail) with the title set over it,
 * falling back to typographic art from the series palette when there is no image or it fails to load.
 */
export default function Poster({ series, variant = 'portrait', showTitle = true }: Props) {
  const [c1, c2] = series.palette
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const image = series.posterUrl && series.posterUrl !== failedUrl ? series.posterUrl : null

  return (
    <div
      className={`poster poster--${variant} ${image ? 'poster--image' : ''}`}
      style={{ '--c1': c1, '--c2': c2 } as CSSProperties}
    >
      {image && (
        <img className="poster__img" src={image} alt="" loading="lazy" onError={() => setFailedUrl(image)} />
      )}
      {showTitle && (
        <>
          {!image && series.genres[0] && <span className="poster__genre">{series.genres[0]}</span>}
          <span className="poster__title">{series.title}</span>
        </>
      )}
      {series.isNew && <span className="poster__badge">New</span>}
    </div>
  )
}
