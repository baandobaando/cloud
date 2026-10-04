import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { EpisodeView as Episode, SeriesDetail as Series } from '../../shared/types'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import Poster from '../components/Poster'
import { ErrorState, Spinner } from '../components/Feedback'

/** Vertical, swipeable episode feed — one full-screen episode per slide. */
export default function Watch() {
  const { seriesId = '', episode = '1' } = useParams()
  const { data: series, error, reload } = useApi<Series>(`/series/${encodeURIComponent(seriesId)}`)
  if (error) return <NotFound message={error} onRetry={reload} />
  if (!series || series.id !== seriesId) return <div className="watch"><Spinner fullscreen /></div>
  if (series.episodes.length === 0) return <NotFound message="This series has no episodes yet." />
  return <Feed key={series.id} series={series} startEpisode={clamp(Number(episode) || 1, 1, series.episodes.length)} />
}

function Feed({ series, startEpisode: requestedEpisode }: { series: Series; startEpisode: number }) {
  const navigate = useNavigate()
  const { progress, saveProgress } = useSession()
  // The URL is rewritten as you swipe, so pin where this viewing session started.
  const [startEpisode] = useState(requestedEpisode)
  const [resumeAt] = useState(() =>
    progress[series.id]?.episodeNumber === requestedEpisode ? progress[series.id].position : 0,
  )
  const [current, setCurrent] = useState(startEpisode)
  const [muted, setMuted] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])

  const canWatch = (n: number) => series.episodes[n - 1]?.locked === false

  const goTo = useCallback((n: number, smooth = true) => {
    slideRefs.current[n - 1]?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'start' })
  }, [])

  // Jump to the starting episode on mount.
  useEffect(() => {
    goTo(startEpisode, false)
  }, [goTo, startEpisode])

  // Track which slide is on screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.episode))
        }
      },
      { root: feedRef.current, threshold: 0.6 },
    )
    slideRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [series])

  // Keep the URL in sync without stacking history entries.
  useEffect(() => {
    navigate(`/watch/${series.id}/${current}`, { replace: true })
  }, [current, navigate, series.id])

  // Keyboard: arrows to move between episodes, Escape to leave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') goTo(Math.min(current + 1, series.episodes.length))
      else if (e.key === 'ArrowUp') goTo(Math.max(current - 1, 1))
      else if (e.key === 'Escape') navigate(`/title/${series.id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, goTo, navigate, series])

  return (
    <div className="watch">
      <div className="watch__backdrop">
        <Poster series={series} variant="wide" showTitle={false} />
      </div>

      <div className="watch__feed" ref={feedRef}>
        {series.episodes.map((ep) => (
          <div
            key={ep.id}
            className="watch__slide"
            data-episode={ep.number}
            ref={(el) => {
              slideRefs.current[ep.number - 1] = el
            }}
          >
            {Math.abs(ep.number - current) <= 1 &&
              (!canWatch(ep.number) ? (
                <Paywall series={series} episode={ep} />
              ) : !ep.videoUrl ? (
                <div className="player player--empty">
                  <p>Episode {ep.number} is coming soon.</p>
                </div>
              ) : (
                <EpisodePlayer
                  episode={ep}
                  active={ep.number === current}
                  startAt={ep.number === startEpisode ? resumeAt : 0}
                  muted={muted}
                  onMutedChange={setMuted}
                  onProgress={(pos) => saveProgress(series.id, ep.number, pos)}
                  onEnded={() => ep.number < series.episodes.length && goTo(ep.number + 1)}
                />
              ))}
          </div>
        ))}
      </div>

      <div className="watch__top">
        <Link to={`/title/${series.id}`} className="icon-btn" aria-label="Back">
          ←
        </Link>
        <div className="watch__meta">
          <strong>{series.title}</strong>
          <span>
            Episode {current} of {series.episodes.length}
          </span>
        </div>
      </div>

      {/* Hidden on locked episodes so the controls don't cover the paywall. */}
      {canWatch(current) && (
        <div className="watch__side">
          <button className="side-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
            <span>{muted ? 'Muted' : 'Sound'}</span>
          </button>
          <button className="side-btn" onClick={() => setDrawerOpen(true)}>
            ☰<span>Episodes</span>
          </button>
          <button className="side-btn" onClick={() => goTo(Math.max(current - 1, 1))} disabled={current === 1}>
            ▲<span>Prev</span>
          </button>
          <button
            className="side-btn"
            onClick={() => goTo(Math.min(current + 1, series.episodes.length))}
            disabled={current === series.episodes.length}
          >
            ▼<span>Next</span>
          </button>
        </div>
      )}

      {drawerOpen && (
        <EpisodeDrawer
          series={series}
          current={current}
          canWatch={canWatch}
          onPick={(n) => {
            setDrawerOpen(false)
            goTo(n, false)
          }}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  )
}

interface PlayerProps {
  episode: Episode
  active: boolean
  startAt: number
  muted: boolean
  onMutedChange: (muted: boolean) => void
  onProgress: (position: number) => void
  onEnded: () => void
}

function EpisodePlayer({ episode, active, startAt, muted, onMutedChange, onProgress, onEnded }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastSaved = useRef(0)
  const [paused, setPaused] = useState(false)
  const [pct, setPct] = useState(0)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (active) {
      v.play().catch(() => {
        // Autoplay with sound was blocked: retry muted.
        onMutedChange(true)
        v.muted = true
        v.play().catch(() => setPaused(true))
      })
      onProgress(v.currentTime)
    } else {
      v.pause()
    }
  }, [active])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().then(() => setPaused(false)).catch(() => {})
    else {
      v.pause()
      setPaused(true)
    }
  }

  return (
    <div className="player" onClick={togglePlay}>
      <video
        ref={videoRef}
        src={episode.videoUrl ?? undefined}
        playsInline
        muted={muted}
        preload="auto"
        onLoadedMetadata={(e) => {
          if (startAt > 0 && startAt < e.currentTarget.duration - 2) e.currentTarget.currentTime = startAt
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (v.duration) setPct((v.currentTime / v.duration) * 100)
          if (active && Math.abs(v.currentTime - lastSaved.current) > 5) {
            lastSaved.current = v.currentTime
            onProgress(v.currentTime)
          }
        }}
        onPlay={() => setPaused(false)}
        onEnded={onEnded}
      />
      {paused && <div className="player__paused">▶</div>}
      <div className="player__caption">
        <span className="player__ep">EP {episode.number}</span> {episode.title}
      </div>
      <div className="player__bar">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Paywall({ series, episode }: { series: Series; episode: Episode }) {
  return (
    <div className="paywall">
      <Poster series={series} variant="wide" showTitle={false} />
      <div className="paywall__body">
        <div className="paywall__lock">🔒</div>
        <h2>Episode {episode.number} is for members</h2>
        <p>
          {series.freeEpisodes > 0 ? `You watched the first ${series.freeEpisodes} free. ` : ''}Become a member to watch all{' '}
          {series.episodes.length} episodes of <em>{series.title}</em> and every other series, with no coins and no
          per-episode unlocks. Pay with crypto.
        </p>
        <Link to={`/plans?return=${encodeURIComponent(`/watch/${series.id}/${episode.number}`)}`} className="btn btn--red btn--block">
          See Plans
        </Link>
      </div>
    </div>
  )
}

interface DrawerProps {
  series: Series
  current: number
  canWatch: (n: number) => boolean
  onPick: (n: number) => void
  onClose: () => void
}

function EpisodeDrawer({ series, current, canWatch, onPick, onClose }: DrawerProps) {
  return (
    <div className="drawer" onClick={onClose}>
      <div className="drawer__panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer__head">
          <strong>{series.title}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ep-grid">
          {series.episodes.map((ep) => (
            <button
              key={ep.id}
              className={`ep-chip ${ep.number === current ? 'ep-chip--current' : ''}`}
              onClick={() => onPick(ep.number)}
            >
              {ep.number}
              {!canWatch(ep.number) && <span className="ep-chip__lock">🔒</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function NotFound({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty">
      <ErrorState message={message} onRetry={onRetry}>
        <Link to="/" className="btn btn--grey">
          Back to Home
        </Link>
      </ErrorState>
    </div>
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}
