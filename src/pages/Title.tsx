import { useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { SeriesDetail } from '../../shared/types'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import Shelf from '../components/Shelf'
import SeriesCard from '../components/SeriesCard'
import Icon from '../components/Icon'
import { ErrorState, Spinner } from '../components/Feedback'

const EPISODES_PREVIEW = 36

export default function Title() {
  const { seriesId = '' } = useParams()
  const navigate = useNavigate()
  const { data: series, error, reload } = useApi<SeriesDetail>(`/series/${encodeURIComponent(seriesId)}`)
  const { me, catalog, myList, toggleMyList, progress } = useSession()
  const [failed, setFailed] = useState(false)
  const [showAllEpisodes, setShowAllEpisodes] = useState(false)

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
  const similar = (catalog ?? []).filter((s) => s.id !== series.id && s.genres.some((g) => series.genres.includes(g))).slice(0, 12)
  const lockedCount = series.episodes.filter((e) => e.locked).length
  const totalMinutes = Math.round(series.episodes.reduce((n, e) => n + e.durationSec, 0) / 60)
  const image = series.posterUrl && !failed ? series.posterUrl : null

  return (
    <main className="page page--detail" style={{ '--hero-a': series.palette[0], '--hero-b': series.palette[1] } as CSSProperties}>
      <div className="detail-wash" aria-hidden>
        {image && <div style={{ backgroundImage: `url("${image}")` }} />}
      </div>
      <div className="container">
        <div className="detail">
          <div className="detail__cover">
            {image ? <img src={image} alt="" onError={() => setFailed(true)} /> : <span className="scard__fallback">{series.title}</span>}
          </div>

          <div className="detail__info">
            <span className="eyebrow">{series.genres.join(' · ')}</span>
            <h1 className="detail__title">{series.title}</h1>
            <p className="detail__meta">
              {series.episodes.length} episodes <span aria-hidden>·</span> about {totalMinutes} min total <span aria-hidden>·</span> {series.rating}
            </p>
            {series.tagline && <p className="detail__tagline">{series.tagline}</p>}
            {series.synopsis && <p className="detail__synopsis">{series.synopsis}</p>}

            <div className="actions">
              {series.episodes.length > 0 && (
                <Link to={`/watch/${series.id}/${resumeEp ?? 1}`} className="btn btn--primary btn--lg">
                  <Icon name="play" size={18} />
                  {resumeEp ? `Resume episode ${resumeEp}` : 'Watch episode 1'}
                </Link>
              )}
              <button
                className="btn btn--glass btn--lg"
                onClick={() => (me ? toggleMyList(series.id) : navigate(`/signup?next=/title/${series.id}`))}
              >
                <Icon name={inList ? 'check' : 'plus'} size={18} />
                {inList ? 'In My List' : 'My List'}
              </button>
            </div>

            {lockedCount > 0 && !me?.isEntitled && (
              <p className="detail__note">
                {series.freeEpisodes > 0 ? `Episodes 1–${series.freeEpisodes} are free. ` : ''}
                <Link to="/plans">Become a member</Link> to unlock the other {lockedCount}.
              </p>
            )}

            <section className="detail__episodes">
              <h2>Episodes</h2>
              {series.episodes.length === 0 ? (
                <p className="muted">Episodes coming soon.</p>
              ) : (
                <>
                <div className="ep-numbers">
                  {(showAllEpisodes ? series.episodes : series.episodes.slice(0, EPISODES_PREVIEW)).map((ep) => (
                    <Link
                      key={ep.id}
                      to={`/watch/${series.id}/${ep.number}`}
                      className={`ep-number ${ep.locked ? 'ep-number--locked' : ''} ${resumeEp === ep.number ? 'ep-number--current' : ''}`}
                      title={`${ep.title} · ${Math.max(1, Math.round(ep.durationSec / 60))} min${ep.locked ? ' · members only' : ''}`}
                    >
                      {ep.number}
                      {ep.locked && <Icon name="lock" size={10} className="ep-number__lock" />}
                    </Link>
                  ))}
                </div>
                {!showAllEpisodes && series.episodes.length > EPISODES_PREVIEW && (
                  <button className="btn btn--glass btn--small detail__more" onClick={() => setShowAllEpisodes(true)}>
                    Show all {series.episodes.length} episodes
                  </button>
                )}
                </>
              )}
            </section>
          </div>
        </div>

        {similar.length > 0 && (
          <div className="sections">
            <Shelf title="More like this">
              {similar.map((s) => (
                <SeriesCard key={s.id} series={s} />
              ))}
            </Shelf>
          </div>
        )}
      </div>
    </main>
  )
}
