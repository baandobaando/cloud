import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { SeriesSummary } from '../../shared/types'
import { useSession } from '../state/Session'
import Icon from './Icon'
import { useRetryImage } from './useRetryImage'

const ROTATE_MS = 9000

/** Featured carousel of the top series (items arrive in rank order): a color wash taken from the cover, copy on the left, the tall cover on the right. */
export default function Hero({ items }: { items: SeriesSummary[] }) {
  const { me, myList, toggleMyList, progress } = useSession()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const series = items[index % items.length]
  const { url: image, key: imgKey, onError } = useRetryImage(series?.posterUrl ?? null)

  useEffect(() => {
    if (paused || items.length < 2) return
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS)
    return () => window.clearTimeout(t)
  }, [index, paused, items.length])

  if (!series) return null
  const inList = myList.includes(series.id)
  const resumeEp = progress[series.id]?.episodeNumber ?? 1
  const [c1, c2] = series.palette

  return (
    <section
      className="feature-hero"
      style={{ '--hero-a': c1, '--hero-b': c2 } as CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="feature-hero__wash" aria-hidden />
      {image && <div key={series.id} className="feature-hero__ambient" style={{ backgroundImage: `url("${image}")` }} aria-hidden />}
      {items.length > 1 && (
        <>
          <button
            className="hero-arrow hero-arrow--prev"
            onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
            aria-label="Previous featured series"
          >
            <Icon name="left" size={22} />
          </button>
          <button className="hero-arrow hero-arrow--next" onClick={() => setIndex((i) => (i + 1) % items.length)} aria-label="Next featured series">
            <Icon name="right" size={22} />
          </button>
        </>
      )}
      <div className="feature-hero__inner">
        <div className="feature-hero__copy" key={series.id}>
          <span className="hero-badge">
            <b>TOP 10</b> #{index % items.length + 1} today
          </span>
          <h1 className="feature-hero__title">{series.title}</h1>
          <p className="feature-hero__meta">
            <span className="pill">{series.rating}</span>
            {series.genres.join(' · ')} <span aria-hidden>·</span> {series.episodeCount} episodes
            <span className="feature-hero__free">First {series.freeEpisodes} free</span>
          </p>
          {(series.tagline || series.synopsis) && <p className="feature-hero__text">{series.tagline || series.synopsis}</p>}
          <div className="actions">
            <Link to={`/watch/${series.id}/${resumeEp}`} className="btn btn--primary btn--lg">
              <Icon name="play" size={18} />
              {resumeEp > 1 ? `Resume episode ${resumeEp}` : 'Play'}
            </Link>
            <Link to={`/title/${series.id}`} className="btn btn--glass btn--lg">
              <Icon name="info" size={18} />
              More info
            </Link>
            <button
              className="icon-btn icon-btn--ring"
              onClick={() => (me ? toggleMyList(series.id) : navigate('/signup'))}
              aria-label={inList ? 'Remove from My List' : 'Add to My List'}
              title={inList ? 'In My List' : 'My List'}
            >
              <Icon name={inList ? 'check' : 'plus'} size={20} />
            </button>
          </div>
          {items.length > 1 && (
            <div className="hero-dots" role="tablist" aria-label="Featured series">
              {items.map((s, i) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={s.title}
                  className={`hero-dot ${i === index ? 'hero-dot--on' : ''} ${paused ? 'hero-dot--paused' : ''}`}
                  onClick={() => setIndex(i)}
                >
                  <span style={{ animationDuration: `${ROTATE_MS}ms` }} />
                </button>
              ))}
            </div>
          )}
        </div>
        <Link to={`/title/${series.id}`} className="feature-hero__cover" key={`c-${series.id}`} aria-label={`More about ${series.title}`}>
          {image ? (
            <img key={imgKey} src={image} alt="" onError={onError} />
          ) : (
            <span className="scard__fallback">{series.title}</span>
          )}
          {series.previewUrl && <HeroPreview key={series.previewUrl} src={series.previewUrl} />}
          <span className="feature-hero__preview-tag" aria-hidden>
            <Icon name="play" size={10} /> Preview
          </span>
        </Link>
      </div>
    </section>
  )
}

/** The moving preview fades in over the still cover once it has loaded, so a slow connection never shows a blank card. */
function HeroPreview({ src }: { src: string }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      className={`feature-hero__preview ${ready ? 'feature-hero__preview--on' : ''}`}
      src={src}
      alt=""
      onLoad={() => setReady(true)}
      onError={() => setFailed(true)}
    />
  )
}
