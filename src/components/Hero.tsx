import { Link } from 'react-router-dom'
import type { Series } from '../data/catalog'
import { useAppState } from '../state/AppState'
import Poster from './Poster'

export default function Hero({ series }: { series: Series }) {
  const { myList, toggleMyList, progress } = useAppState()
  const inList = myList.includes(series.id)
  const resumeEp = progress[series.id]?.episodeNumber ?? 1

  return (
    <section className="hero">
      <div className="hero__art">
        <Poster series={series} variant="wide" showTitle={false} />
      </div>
      <div className="hero__content">
        {series.trendingRank && <div className="hero__kicker">#{series.trendingRank} in Short Dramas Today</div>}
        <h1 className="hero__title">{series.title}</h1>
        <p className="hero__tagline">{series.tagline}</p>
        <div className="hero__actions">
          <Link to={`/watch/${series.id}/${resumeEp}`} className="btn btn--white">
            ▶ {resumeEp > 1 ? `Resume Ep ${resumeEp}` : 'Play'}
          </Link>
          <button className="btn btn--grey" onClick={() => toggleMyList(series.id)}>
            {inList ? '✓ My List' : '+ My List'}
          </button>
          <Link to={`/title/${series.id}`} className="btn btn--grey">
            ⓘ More Info
          </Link>
        </div>
      </div>
    </section>
  )
}
