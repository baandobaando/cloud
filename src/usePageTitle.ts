import { useEffect } from 'react'

const DEFAULT_TITLE = "BingeTube · Short drama series you can't stop watching"

/** Names the browser tab for the current page; no title means the site default. */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · BingeTube` : DEFAULT_TITLE
  }, [title])
}
