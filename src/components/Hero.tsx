import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { SeriesSummary } from '../../shared/types'
import { useSession } from '../state/Session'
import Icon from './Icon'

/** Featured series: copy on the left, the tall vertical cover on the right (the format these shows are made in). */
export default function Hero({ series }: { series: SeriesSummary }) {
  const { me, myList, toggleMyList, progress } = useSession()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const inList = myList.includes(series.id)
  const resumeEp = progress[series.id]?.episodeNumber ?? 1
  const image = series.posterUrl && !failed ? series.posterUrl : null

  return (
    <section className="feature-hero">
      {image && <div className="feature-hero__ambient" style={{ backgroundImage: `url("${image}")` }} aria-hidden />}
      <div className="feature-hero__inner">
        <div className="feature-hero__copy">
          <span className="eyebrow">Featured series</span>
          <h1 className="feature-hero__title">{series.title}</h1>
          <p className="feature-hero__meta">
            {series.genres.join(' · ')} <span aria-hidden>·</span> {series.episodeCount} episodes{' '}
            <span aria-hidden>·</span> First {series.freeEpisodes} free
          </p>
          {(series.tagline || series.synopsis) && <p className="feature-hero__text">{series.tagline || series.synopsis}</p>}
          <div className="actions">
            <Link to={`/watch/${series.id}/${resumeEp}`} className="btn btn--primary btn--lg">
              <Icon name="play" size={18} />
              {resumeEp > 1 ? `Resume episode ${resumeEp}` : 'Watch episode 1'}
            </Link>
            <button className="btn btn--glass btn--lg" onClick={() => (me ? toggleMyList(series.id) : navigate('/signup'))}>
              <Icon name={inList ? 'check' : 'plus'} size={18} />
              {inList ? 'In My List' : 'My List'}
            </button>
          </div>
        </div>
        <Link to={`/title/${series.id}`} className="feature-hero__cover" aria-label={`More about ${series.title}`}>
          {image ? <img src={image} alt="" onError={() => setFailed(true)} /> : <span className="scard__fallback">{series.title}</span>}
        </Link>
      </div>
    </section>
  )
}
