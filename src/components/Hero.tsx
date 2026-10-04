import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { SeriesSummary } from '../../shared/types'
import { useSession } from '../state/Session'
import Icon from './Icon'

export default function Hero({ series }: { series: SeriesSummary }) {
  const { myList, toggleMyList, progress } = useSession()
  const inList = myList.includes(series.id)
  const resumeEp = progress[series.id]?.episodeNumber ?? 1
  const [c1, c2] = series.palette

  return (
    <section className="hero" style={{ '--c1': c1, '--c2': c2 } as CSSProperties}>
      <div className="hero__art" aria-hidden>
        {series.posterUrl && <img src={series.posterUrl} alt="" />}
      </div>
      <div className="hero__content">
        <div className="hero__meta">
          {series.trendingRank && <span className="tag tag--accent">#{series.trendingRank} today</span>}
          <span>{series.genres.join(' · ')}</span>
          <span>{series.episodeCount} episodes</span>
        </div>
        <h1 className="hero__title">{series.title}</h1>
        <p className="hero__tagline">{series.tagline}</p>
        <div className="actions">
          <Link to={`/watch/${series.id}/${resumeEp}`} className="btn btn--primary">
            <Icon name="play" size={18} />
            {resumeEp > 1 ? `Resume episode ${resumeEp}` : 'Play'}
          </Link>
          <button className="btn btn--glass" onClick={() => toggleMyList(series.id)}>
            <Icon name={inList ? 'check' : 'plus'} size={18} />
            My List
          </button>
          <Link to={`/title/${series.id}`} className="btn btn--glass">
            <Icon name="info" size={18} />
            Details
          </Link>
        </div>
      </div>
    </section>
  )
}
