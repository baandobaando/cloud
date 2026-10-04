import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { EpisodeView as Episode, SeriesDetail as Series } from '../../shared/types'
import { useSession } from '../state/Session'
import { useApi } from '../useApi'
import Poster from '../components/Poster'
import Icon from '../components/Icon'
import { ErrorState, Spinner } from '../components/Feedback'
import { useVideoSource } from '../useVideoSource'
import { usePageTitle } from '../usePageTitle'

const SEEK_STEP = 10
const CONTROLS_HIDE_MS = 3000
const NEXT_COUNTDOWN = 5

/** Episode player: swipe or scroll between episodes, with full playback controls on each. */
export default function Watch() {
  const { seriesId = '', episode = '1' } = useParams()
  const { me } = useSession()
  // Re-fetched when membership changes (e.g. right after paying) so episodes unlock without a page reload.
  const { data: series, error, reload } = useApi<Series>(`/series/${encodeURIComponent(seriesId)}${me?.isEntitled ? '?member' : ''}`)
  usePageTitle(series?.id === seriesId ? `${series.title} · Episode ${episode}` : null)
  if (error) return <NotFound message={error} onRetry={reload} />
  if (!series || series.id !== seriesId) return <div className="watch"><Spinner fullscreen /></div>
  if (series.episodes.length === 0) return <NotFound message="This series has no episodes yet." />
  return <Feed key={series.id} series={series} startEpisode={clamp(Number(episode) || 1, 1, series.episodes.length)} />
}

function Feed({ series, startEpisode: requestedEpisode }: { series: Series; startEpisode: number }) {
  const navigate = useNavigate()
  const { progress, saveProgress } = useSession()
  // The URL is rewritten as you move between episodes, so pin where this viewing session started.
  const [startEpisode] = useState(requestedEpisode)
  const [resumeAt] = useState(() =>
    progress[series.id]?.episodeNumber === requestedEpisode ? progress[series.id].position : 0,
  )
  const [current, setCurrent] = useState(startEpisode)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const total = series.episodes.length

  const canWatch = (n: number) => series.episodes[n - 1]?.locked === false

  const goTo = useCallback((n: number, smooth = true) => {
    slideRefs.current[n - 1]?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'start' })
  }, [])

  useEffect(() => {
    goTo(startEpisode, false)
  }, [goTo, startEpisode])

  // Track which episode is on screen.
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

  useEffect(() => {
    navigate(`/watch/${series.id}/${current}`, { replace: true })
  }, [current, navigate, series.id])

  // Episode-level keys; playback keys live in the active player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === 'N' && e.shiftKey)) {
        e.preventDefault()
        goTo(Math.min(current + 1, total))
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === 'P' && e.shiftKey)) {
        e.preventDefault()
        goTo(Math.max(current - 1, 1))
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        if (drawerOpen) setDrawerOpen(false)
        else navigate(`/title/${series.id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, goTo, navigate, series.id, total, drawerOpen])

  const currentEp = series.episodes[current - 1]
  const showBareTopBar = !currentEp || !canWatch(current) || !currentEp.videoUrl

  return (
    <div className="watch" ref={rootRef}>
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
                  series={series}
                  episode={ep}
                  active={ep.number === current}
                  startAt={ep.number === startEpisode ? resumeAt : 0}
                  muted={muted}
                  volume={volume}
                  onMutedChange={setMuted}
                  onVolumeChange={setVolume}
                  onProgress={(pos) => saveProgress(series.id, ep.number, pos)}
                  nextEpisode={series.episodes[ep.number] ?? null}
                  onNext={() => goTo(ep.number + 1)}
                  onPrev={ep.number > 1 ? () => goTo(ep.number - 1) : undefined}
                  onEpisodes={() => setDrawerOpen(true)}
                  fullscreenTarget={rootRef}
                />
              ))}
          </div>
        ))}
      </div>

      {showBareTopBar && (
        <div className="watch__top">
          <Link to={`/title/${series.id}`} className="icon-btn" aria-label="Back to series">
            <Icon name="back" />
          </Link>
          <div className="watch__meta">
            <strong>{series.title}</strong>
            <span>
              Episode {current} of {total}
            </span>
          </div>
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
  series: Series
  episode: Episode
  active: boolean
  startAt: number
  muted: boolean
  volume: number
  onMutedChange: (muted: boolean) => void
  onVolumeChange: (volume: number) => void
  onProgress: (position: number) => void
  nextEpisode: Episode | null
  onNext: () => void
  onPrev?: () => void
  onEpisodes: () => void
  fullscreenTarget: RefObject<HTMLDivElement | null>
}

function EpisodePlayer(props: PlayerProps) {
  const { series, episode, active, startAt, muted, volume, onMutedChange, onVolumeChange, onProgress, nextEpisode, onNext, onPrev, onEpisodes, fullscreenTarget } = props
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastSaved = useRef(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastTap = useRef<{ t: number; x: number } | null>(null)
  const singleTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [controls, setControls] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)
  const [flash, setFlash] = useState<{ side: 'left' | 'right'; key: number } | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const v = () => videoRef.current
  const activeRef = useRef(active)
  activeRef.current = active

  useVideoSource(videoRef, episode.videoUrl, () => {
    // HLS sources attach asynchronously; start playback once they're ready if this episode is on screen.
    if (activeRef.current) videoRef.current?.play().catch(() => {})
  })

  const showControls = useCallback(() => {
    setControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControls(false)
    }, CONTROLS_HIDE_MS)
  }, [])

  // Start or stop playback as this episode becomes the active one.
  useEffect(() => {
    const video = v()
    if (!video) return
    if (active) {
      video.play().catch(() => {
        // Autoplay with sound was blocked: retry muted.
        onMutedChange(true)
        video.muted = true
        video.play().catch(() => setPlaying(false))
      })
      onProgress(video.currentTime)
      showControls()
    } else {
      video.pause()
      setCountdown(null)
    }
  }, [active])

  useEffect(() => {
    if (v()) v()!.volume = volume
  }, [volume])

  useEffect(() => () => {
    clearTimeout(hideTimer.current)
    clearTimeout(singleTapTimer.current)
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // "Next episode in 5…" countdown after an episode ends.
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      onNext()
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [countdown, onNext])

  const togglePlay = useCallback(() => {
    const video = v()
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
    showControls()
  }, [showControls])

  const seekBy = useCallback(
    (delta: number) => {
      const video = v()
      if (!video || !Number.isFinite(video.duration)) return
      video.currentTime = clamp(video.currentTime + delta, 0, video.duration - 0.1)
      setFlash({ side: delta < 0 ? 'left' : 'right', key: Date.now() })
      showControls()
    },
    [showControls],
  )

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else fullscreenTarget.current?.requestFullscreen?.().catch(() => {})
  }, [fullscreenTarget])

  const toggleMute = useCallback(() => {
    const next = !muted
    onMutedChange(next)
    if (!next && volume === 0) onVolumeChange(0.5)
    showControls()
  }, [muted, volume, onMutedChange, onVolumeChange, showControls])

  // Playback keyboard shortcuts for the active player.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
        case 'j':
          e.preventDefault()
          seekBy(-SEEK_STEP)
          break
        case 'ArrowRight':
        case 'l':
          e.preventDefault()
          seekBy(SEEK_STEP)
          break
        case 'f':
          toggleFullscreen()
          break
        case 'm':
          toggleMute()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, togglePlay, seekBy, toggleFullscreen, toggleMute])

  /** Mouse: click toggles play. Touch: tap toggles controls, double-tap a side skips 10s. */
  const onSurfacePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      togglePlay()
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const now = Date.now()
    const prev = lastTap.current
    if (prev && now - prev.t < 300 && (x < 0.4 || x > 0.6)) {
      clearTimeout(singleTapTimer.current)
      lastTap.current = null
      seekBy(x < 0.5 ? -SEEK_STEP : SEEK_STEP)
      return
    }
    lastTap.current = { t: now, x }
    clearTimeout(singleTapTimer.current)
    singleTapTimer.current = setTimeout(() => {
      if (controls) setControls(false)
      else showControls()
    }, 250)
  }

  const pct = duration ? (time / duration) * 100 : 0
  const bufPct = duration ? (buffered / duration) * 100 : 0
  const visible = controls || !playing || scrubbing || countdown !== null

  return (
    <div
      className={`player ${visible ? 'player--controls' : 'player--idle'}`}
      onMouseMove={showControls}
      onMouseLeave={() => playing && setControls(false)}
    >
      <video
        ref={videoRef}
        playsInline
        muted={muted}
        preload="auto"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration)
          if (startAt > 0 && startAt < e.currentTarget.duration - 2) e.currentTarget.currentTime = startAt
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const video = e.currentTarget
          if (!scrubbing) setTime(video.currentTime)
          if (video.buffered.length) setBuffered(video.buffered.end(video.buffered.length - 1))
          if (active && Math.abs(video.currentTime - lastSaved.current) > 5) {
            lastSaved.current = video.currentTime
            onProgress(video.currentTime)
          }
        }}
        onPlay={() => {
          setPlaying(true)
          setCountdown(null)
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onEnded={() => {
          setPlaying(false)
          onProgress(0)
          if (nextEpisode) setCountdown(NEXT_COUNTDOWN)
        }}
      />

      <div className="player__surface" onPointerUp={onSurfacePointerUp} />

      {waiting && playing && <div className="player__loading"><div className="spinner" /></div>}

      {flash && (
        <div key={flash.key} className={`player__flash player__flash--${flash.side}`}>
          <Icon name={flash.side === 'left' ? 'rewind' : 'forward'} size={30} />
          <span>{SEEK_STEP}s</span>
        </div>
      )}

      {/* Mouse clicks don't focus buttons, so Space keeps meaning play/pause (Tab focus still works). */}
      <div className="player__chrome" onMouseDown={(e) => (e.target as Element).closest('button') && e.preventDefault()}>
        <div className="player__top">
          <Link to={`/title/${series.id}`} className="icon-btn icon-btn--ghost" aria-label="Back to series">
            <Icon name="back" />
          </Link>
          <div className="player__titles">
            <strong>{series.title}</strong>
            <span>
              Episode {episode.number} · {episode.title}
            </span>
          </div>
        </div>

        <div className="player__center">
          <button className="player__btn" onClick={() => seekBy(-SEEK_STEP)} aria-label={`Back ${SEEK_STEP} seconds`}>
            <Icon name="rewind" size={30} />
            <small>{SEEK_STEP}</small>
          </button>
          <button className="player__btn player__btn--main" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} size={34} />
          </button>
          <button className="player__btn" onClick={() => seekBy(SEEK_STEP)} aria-label={`Forward ${SEEK_STEP} seconds`}>
            <Icon name="forward" size={30} />
            <small>{SEEK_STEP}</small>
          </button>
        </div>

        <div className="player__bottom">
          <div className="player__timeline">
            <input
              id={`seek-${episode.id}`}
              className="player__seek"
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={time}
              aria-label="Seek"
              aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
              style={{ '--pct': `${pct}%`, '--buf': `${bufPct}%` } as CSSProperties}
              onPointerDown={() => setScrubbing(true)}
              onPointerUp={() => setScrubbing(false)}
              onChange={(e) => {
                const t = Number(e.target.value)
                setTime(t)
                if (v()) v()!.currentTime = t
                showControls()
              }}
            />
            <span className="player__time">-{formatTime(Math.max(0, duration - time))}</span>
          </div>
          <div className="player__row">
            <div className="player__group">
              <button className="player__icon" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                <Icon name={playing ? 'pause' : 'play'} size={22} />
              </button>
              <div className="player__volume">
                <button className="player__icon" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
                  <Icon name={muted || volume === 0 ? 'mute' : 'volume'} size={22} />
                </button>
                <input
                  id={`vol-${episode.id}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  aria-label="Volume"
                  style={{ '--pct': `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    onVolumeChange(val)
                    onMutedChange(val === 0)
                    showControls()
                  }}
                />
              </div>
              <span className="player__clock">
                {formatTime(time)} / {formatTime(duration)}
              </span>
            </div>
            <div className="player__group">
              {onPrev && (
                <button className="player__icon player__wide-only" onClick={onPrev} aria-label="Previous episode">
                  <Icon name="up" size={22} />
                </button>
              )}
              <button className="player__icon player__labeled" onClick={onEpisodes} aria-label="Episodes">
                <Icon name="list" size={22} />
                <span>Episodes</span>
              </button>
              {nextEpisode && (
                <button className="player__icon player__labeled" onClick={onNext} aria-label="Next episode">
                  <Icon name="next" size={20} />
                  <span>Next</span>
                </button>
              )}
              {document.fullscreenEnabled && (
                <button className="player__icon" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}>
                  <Icon name={isFullscreen ? 'shrink' : 'expand'} size={22} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {countdown !== null && nextEpisode && (
        <div className="next-up" role="status">
          <span className="eyebrow">Next episode</span>
          <strong>
            Episode {nextEpisode.number} · {nextEpisode.title}
          </strong>
          <div className="next-up__actions">
            <button className="btn btn--primary btn--small" onClick={() => { setCountdown(null); onNext() }}>
              <Icon name="play" size={16} /> Play now
            </button>
            <button className="btn btn--glass btn--small" onClick={() => setCountdown(null)}>
              Cancel
            </button>
          </div>
          <div className="next-up__timer" style={{ '--t': `${NEXT_COUNTDOWN}s` } as CSSProperties} />
          <span className="muted small">Starts in {countdown}s</span>
        </div>
      )}
    </div>
  )
}

/**
 * Points the <video> at the episode. Bunny serves HLS (.m3u8): Safari plays it natively,
 * other browsers get hls.js (loaded on demand) for adaptive 1080p/720p/480p switching.
 */
function Paywall({ series, episode }: { series: Series; episode: Episode }) {
  return (
    <div className="paywall">
      <Poster series={series} variant="wide" showTitle={false} />
      <div className="paywall__body">
        <div className="paywall__lock"><Icon name="lock" size={28} /></div>
        <h2>Episode {episode.number} is for members</h2>
        <p>
          {series.freeEpisodes > 0 ? `You watched the first ${series.freeEpisodes} free. ` : ''}Become a member to watch all{' '}
          {series.episodes.length} episodes of <em>{series.title}</em> and every other series, with no coins and no
          per-episode unlocks. Pay by card, Apple Pay or Google Pay.
        </p>
        <Link to={`/plans?return=${encodeURIComponent(`/watch/${series.id}/${episode.number}`)}`} className="btn btn--accent btn--block">
          Join for $9.99/month
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
      <div className="drawer__panel" role="dialog" aria-label="Episodes" onClick={(e) => e.stopPropagation()}>
        <div className="drawer__head">
          <strong>{series.title}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
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
              {!canWatch(ep.number) && <Icon name="lock" size={12} className="ep-chip__lock" />}
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
        <Link to="/" className="btn btn--secondary">
          Back to Home
        </Link>
      </ErrorState>
    </div>
  )
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}
