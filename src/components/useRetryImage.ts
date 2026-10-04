import { useState } from 'react'

/** Retries a failed image once (CDN hiccups are common on mobile) before giving up. */
export function useRetryImage(src: string | null) {
  const [state, setState] = useState<{ src: string | null; tries: number; failed: boolean }>({ src, tries: 0, failed: false })
  const current = state.src === src ? state : { src, tries: 0, failed: false }
  const onError = () => {
    if (current.tries === 0) window.setTimeout(() => setState({ src, tries: 1, failed: false }), 1200)
    else setState({ src, tries: current.tries, failed: true })
  }
  return { url: src && !current.failed ? src : null, key: current.tries, onError }
}
