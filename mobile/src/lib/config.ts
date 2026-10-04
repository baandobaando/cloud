/** The live BingeTube server the app talks to. */
export const API_BASE = 'https://binge.tube'

/** Bunny's CDN only serves video and images to requests that come from the BingeTube site. */
export const MEDIA_HEADERS = { Referer: 'https://binge.tube/' }

export const PRIVACY_URL = `${API_BASE}/privacy`
export const TERMS_URL = `${API_BASE}/terms`
