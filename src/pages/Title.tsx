import { Link, useNavigate, useParams } from 'react-router-dom'
import type { SeriesDetail } from '../../shared/types'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import Row from '../components/Row'
import { ErrorState, Spinner } from '../components/Feedback'

export default function Title() {
  const { seriesId = '' } = useParams()
  const navigate = useNavigate()
  const { data: series, error, reload } = useApi<SeriesDetail>(`/series/${encodeURIComponent(seriesId)}`)
  const { me, catalog, myList, toggleMyList, progress } = useSession()

  if (error) {
    return (
      <main className="page">
        <ErrorState message={error} onRetry={reload}>
          <Link to="/" className="btn btn--secondary">
            Back to Home
          </Link>
        </ErrorState>
      </main>
    )
  }
  if (!series || series.id !== seriesId) return <Spinner fullscreen />

  const inList = myList.includes(series.id)
  const resumeEp = progress[series.id]?.episodeNumber
  const similar = (catalog ?? []).filter((s) => s.id !== series.id && s.genres.some((g) => series.genres.includes(g)))
  const lockedCount = series.episodes.filter((e) => e.locked).length

  return (
    <main className="page page--title">
      <div className="title__hero">
        <Poster series={series} variant="wide" showTitle={false} />
        <button className="icon-btn title__close" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="title__body">
        <h1>{series.title}</h1>
        <div className="title__meta">
          {series.isNew && <span className="tag tag--accent">New</span>}
          <span>{series.year}</span>
          <span className="tag">{series.rating}</span>
          <span>{series.episodes.length} episodes</span>
          <span>{series.genres.join(' · ')}</span>
        </div>
        <div className="actions">
          {series.episodes.length > 0 && (
            <Link to={`/watch/${series.id}/${resumeEp ?? 1}`} className="btn btn--primary">
              <Icon name="play" size={18} />
              {resumeEp ? `Resume episode ${resumeEp}` : 'Play episode 1'}
            </Link>
          )}
          <button className="btn btn--glass" onClick={() => (me ? toggleMyList(series.id) : navigate(`/signup?next=/title/${series.id}`))}>
            <Icon name={inList ? 'check' : 'plus'} size={18} />
            {inList ? 'In My List' : 'My List'}
          </button>
        </div>
        {series.tagline && <p className="title__tagline">{series.tagline}</p>}
        <p className="title__synopsis">{series.synopsis}</p>
        {lockedCount > 0 && !me?.isEntitled && (
          <div className="notice">
            {series.freeEpisodes > 0 ? `First ${series.freeEpisodes} episodes free. ` : ''}
            <Link to="/plans">Become a member</Link> to unlock all {series.episodes.length} episodes and every other series.
          </div>
        )}

        <h2 className="section-title">Episodes</h2>
        {series.episodes.length === 0 ? (
          <p className="muted">Episodes coming soon.</p>
        ) : (
          <ol className="ep-list">
            {series.episodes.map((ep) => (
              <li key={ep.id}>
                <Link to={`/watch/${series.id}/${ep.number}`} className={`ep-row ${resumeEp === ep.number ? 'ep-row--current' : ''}`}>
                  <span className="ep-row__num">{ep.number}</span>
                  <span className="ep-row__title">{ep.title}</span>
                  <span className="ep-row__dur">{Math.max(1, Math.round(ep.durationSec / 60))}m</span>
                  <span className="ep-row__icon">
                    <Icon name={ep.locked ? 'lock' : 'play'} size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
      <Row title="More Like This" items={similar} />
    </main>
  )
}
