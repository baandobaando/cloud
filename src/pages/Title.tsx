import { Link, useNavigate, useParams } from 'react-router-dom'
import { CATALOG, FREE_EPISODES, getSeries, isEpisodeFree } from '../data/catalog'
import { useAppState } from '../state/AppState'
import Poster from '../components/Poster'
import Row from '../components/Row'

export default function Title() {
  const { seriesId = '' } = useParams()
  const navigate = useNavigate()
  const series = getSeries(seriesId)
  const { myList, toggleMyList, progress, plan } = useAppState()

  if (!series) {
    return (
      <main className="page empty">
        <p>That series doesn't exist.</p>
        <Link to="/" className="btn btn--white">
          Back to Home
        </Link>
      </main>
    )
  }

  const inList = myList.includes(series.id)
  const resumeEp = progress[series.id]?.episodeNumber
  const similar = CATALOG.filter((s) => s.id !== series.id && s.genres.some((g) => series.genres.includes(g)))

  return (
    <main className="page page--title">
      <div className="title__hero">
        <Poster series={series} variant="wide" showTitle={false} />
        <button className="icon-btn title__close" onClick={() => navigate(-1)} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="title__body">
        <h1>{series.title}</h1>
        <div className="title__meta">
          {series.isNew && <span className="pill pill--red">New</span>}
          <span>{series.year}</span>
          <span className="pill">{series.rating}</span>
          <span>{series.episodes.length} episodes</span>
          <span>{series.genres.join(' · ')}</span>
        </div>
        <div className="hero__actions">
          <Link to={`/watch/${series.id}/${resumeEp ?? 1}`} className="btn btn--white">
            ▶ {resumeEp ? `Resume Episode ${resumeEp}` : 'Play Episode 1'}
          </Link>
          <button className="btn btn--grey" onClick={() => toggleMyList(series.id)}>
            {inList ? '✓ In My List' : '+ My List'}
          </button>
        </div>
        <p className="title__tagline">{series.tagline}</p>
        <p className="title__synopsis">{series.synopsis}</p>
        {!plan && (
          <div className="notice">
            First {FREE_EPISODES} episodes free. <Link to="/plans">Subscribe</Link> to unlock every episode of every series.
          </div>
        )}

        <h2 className="section-title">Episodes</h2>
        <ol className="ep-list">
          {series.episodes.map((ep) => {
            const locked = !plan && !isEpisodeFree(ep.number)
            return (
              <li key={ep.id}>
                <Link to={`/watch/${series.id}/${ep.number}`} className={`ep-row ${resumeEp === ep.number ? 'ep-row--current' : ''}`}>
                  <span className="ep-row__num">{ep.number}</span>
                  <span className="ep-row__title">{ep.title}</span>
                  <span className="ep-row__dur">{Math.round(ep.durationSec / 60)}m</span>
                  <span className="ep-row__icon">{locked ? '🔒' : '▶'}</span>
                </Link>
              </li>
            )
          })}
        </ol>
      </div>
      <Row title="More Like This" items={similar} />
    </main>
  )
}
