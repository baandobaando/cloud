import { useEffect, useRef, type RefObject } from 'react'

/** Attaches a video URL to a <video>, using hls.js (loaded on demand) for HLS where the browser can't play it natively. */
export function useVideoSource(videoRef: RefObject<HTMLVideoElement | null>, url: string | null, onReady: () => void) {
  const readyRef = useRef(onReady)
  readyRef.current = onReady

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return
    const isHls = /\.m3u8($|\?)/.test(url) || url.includes('/playlist.m3u8')
    if (!isHls || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      return () => {
        video.removeAttribute('src')
        video.load()
      }
    }
    let hls: { destroy: () => void } | null = null
    let cancelled = false
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return
      if (!Hls.isSupported()) {
        video.src = url
        return
      }
      const instance = new Hls({ capLevelToPlayerSize: true, startLevel: -1 })
      instance.on(Hls.Events.MANIFEST_PARSED, () => readyRef.current())
      instance.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) instance.startLoad()
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) instance.recoverMediaError()
      })
      instance.loadSource(url)
      instance.attachMedia(video)
      hls = instance
    })
    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [videoRef, url])
}
