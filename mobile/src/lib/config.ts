/** The live BingeTube server the app talks to. */
export const API_BASE = 'https://binge.tube'

/** Bunny's CDN only serves video and images to requests that come from the BingeTube site. */
export const MEDIA_HEADERS = { Referer: 'https://binge.tube/' }

export const PRIVACY_URL = `${API_BASE}/privacy`
export const TERMS_URL = `${API_BASE}/terms`
export const SUPPORT_URL = `${API_BASE}/support`
/** Apple's standard Terms of Use (EULA), required on the subscription screen. */
export const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
export const CONTACT_EMAIL = 'support@binge.tube'

/** RevenueCat public SDK key for the App Store app (set at build time, see README). */
export const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? ''
/** The RevenueCat entitlement that means "member" (matches REVENUECAT_ENTITLEMENT on the server). */
export const ENTITLEMENT = 'members'
