import { useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MEMBERSHIP, formatPrice, type SeriesDetail } from '../../shared/types'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import Shelf from '../components/Shelf'
import SeriesCard from '../components/SeriesCard'
import Icon from '../components/Icon'
import { ErrorState, Spinner } from '../components/Feedback'
import { useRetryImage } from '../components/useRetryImage'
import { usePageTitle } from '../usePageTitle'

const RANGE = 24

export default function Title() {
  const { seriesId = '' } = useParams()
  const navigate = useNavigate()
  const { me, catalog, myList, toggleMyList, progress } = useSession()
  // Re-fetched when membership changes (e.g. right after paying) so episodes unlock without a page reload.
  const { data: series, error, reload } = useApi<SeriesDetail>(`/series/${encodeURIComponent(seriesId)}${me?.isEntitled ? '?member' : ''}`)
  usePageTitle(series?.id === seriesId ? series.title : null)
  const [failed, setFailed] = useState(false)

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
            <div className="detail__tags">
              {series.genres.map((g) => (
                <Link key={g} to={`/browse?genre=${encodeURIComponent(g)}`} className="detail__genre">
                  {g}
                </Link>
              ))}
            </div>
            <h1 className="detail__title">{series.title}</h1>
            <div className="detail__facts">
              <span className="pill">{series.rating}</span>
              <span>
                <Icon name="film" size={15} /> {series.episodes.length} episodes
              </span>
              <span>
                <Icon name="clock" size={15} /> {totalMinutes} min
              </span>
              {!me?.isEntitled && series.freeEpisodes > 0 && <span className="detail__free">{series.freeEpisodes} free</span>}
            </div>
            {series.tagline && <p className="detail__tagline">{series.tagline}</p>}
            {series.synopsis && series.synopsis !== series.tagline && <p className="detail__synopsis">{series.synopsis}</p>}

            <div className="actions">
              {series.episodes.length > 0 && (
                <Link to={`/watch/${series.id}/${resumeEp ?? 1}`} className="btn btn--primary btn--lg">
                  <Icon name="play" size={18} />
                  {resumeEp ? `Resume episode ${resumeEp}` : 'Play episode 1'}
                </Link>
              )}
              <button
                className="icon-btn icon-btn--ring"
                onClick={() => (me ? toggleMyList(series.id) : navigate(`/signup?next=/title/${series.id}`))}
                aria-label={inList ? 'Remove from My List' : 'Add to My List'}
                title={inList ? 'In My List' : 'Add to My List'}
              >
                <Icon name={inList ? 'check' : 'plus'} size={20} />
              </button>
            </div>

            {lockedCount > 0 && !me?.isEntitled && (
              <div className="unlock-card">
                <div className="unlock-card__icon">
                  <Icon name="unlock" size={20} />
                </div>
                <div className="unlock-card__text">
                  <strong>Unlock all {series.episodes.length} episodes</strong>
                  <span>
                    {series.freeEpisodes > 0 ? `First ${series.freeEpisodes} are free. ` : ''}Every series included for {formatPrice(MEMBERSHIP.priceCents)} a month.
                  </span>
                </div>
                <Link
                  to={me ? `/plans?return=/title/${series.id}` : `/signup?next=${encodeURIComponent(`/plans?return=/title/${series.id}`)}`}
                  className="btn btn--accent btn--small"
                >
                  Join now
                </Link>
              </div>
            )}

            <Episodes key={series.id} series={series} resumeEp={resumeEp} />
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

function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Episode tiles with a still from each episode, split into tabs of 24 for long series. */
function Episodes({ series, resumeEp }: { series: SeriesDetail; resumeEp?: number }) {
  const { me } = useSession()
  const total = series.episodes.length
  const ranges = Math.ceil(total / RANGE)
  const [range, setRange] = useState(() => (resumeEp ? Math.min(ranges - 1, Math.floor((resumeEp - 1) / RANGE)) : 0))
  const shown = series.episodes.slice(range * RANGE, range * RANGE + RANGE)

  return (
    <section className="episodes">
      <header className="episodes__head">
        <h2>Episodes</h2>
        {ranges > 1 && (
          <div className="episodes__ranges" role="tablist" aria-label="Episode ranges">
            {Array.from({ length: ranges }, (_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === range}
                className={`episodes__range ${i === range ? 'episodes__range--on' : ''}`}
                onClick={() => setRange(i)}
              >
                {i * RANGE + 1}–{Math.min(total, (i + 1) * RANGE)}
              </button>
            ))}
          </div>
        )}
      </header>
      {total === 0 ? (
        <p className="muted">Episodes coming soon.</p>
      ) : (
        <div className="ep-tiles">
          {shown.map((ep) => (
            <Link
              key={ep.id}
              to={`/watch/${series.id}/${ep.number}`}
              className={`ep-tile ${ep.locked ? 'ep-tile--locked' : ''} ${resumeEp === ep.number ? 'ep-tile--current' : ''}`}
              aria-label={`Episode ${ep.number}${ep.locked ? ', members only' : ''}`}
            >
              <div className="ep-tile__img">
                <EpisodeThumb src={ep.thumbUrl ?? null} />
                <span className="ep-tile__num">{ep.number}</span>
                {ep.locked ? (
                  <span className="ep-tile__lock">
                    <Icon name="lock" size={14} />
                  </span>
                ) : (
                  !me?.isEntitled && ep.number <= series.freeEpisodes && <span className="ep-tile__free">Free</span>
                )}
                <span className="ep-tile__play">
                  <Icon name="play" size={18} />
                </span>
                {resumeEp === ep.number && <span className="ep-tile__now">Watching</span>}
              </div>
              <span className="ep-tile__meta">
                Episode {ep.number} <em>{formatDuration(ep.durationSec)}</em>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function EpisodeThumb({ src }: { src: string | null }) {
  const { url, key, onError } = useRetryImage(src)
  return url ? <img key={key} src={url} alt="" loading="lazy" onError={onError} /> : null
}
