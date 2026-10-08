import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'
import { api, ApiError } from './api'
import { API_BASE } from './config'

export type SocialProvider = 'apple' | 'google' | 'facebook'

export interface Providers {
  google: boolean
  facebook: boolean
  apple: boolean
}

/** Which sign-in options to show: Apple whenever the device supports it, Google/Facebook once the server has keys. */
export async function loadProviders(): Promise<Providers> {
  const [server, apple] = await Promise.all([
    api.get<{ google?: boolean; facebook?: boolean; appleNative?: boolean }>('/auth/providers').catch(() => ({}) as Record<string, boolean>),
    Platform.OS === 'ios' ? AppleAuthentication.isAvailableAsync().catch(() => false) : Promise.resolve(false),
  ])
  return { google: !!server.google, facebook: !!server.facebook, apple: apple && server.appleNative !== false }
}

/** Thrown when the person closes the sign-in sheet; callers stay quiet about it. */
export class Cancelled extends Error {}

const ERRORS: Record<string, string> = {
  noemail: 'That account did not share an email address. Try another way to sign in.',
  expired: 'Sign-in took too long. Please try again.',
  unavailable: 'That sign-in option is not available right now.',
}

/** Signs in with Apple, Google or Facebook; on success the server has set the session cookie. */
export async function socialSignIn(p: SocialProvider): Promise<void> {
  if (p === 'apple') {
    const nonce = Crypto.randomUUID()
    let credential: AppleAuthentication.AppleAuthenticationCredential
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce,
      })
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new Cancelled()
      throw e
    }
    if (!credential.identityToken) throw new ApiError(0, 'Sign in with Apple did not complete. Please try again.')
    // Apple shares the name only the first time someone signs in.
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ')
    await api.post('/auth/apple/native', { identityToken: credential.identityToken, nonce, name })
    return
  }

  // Google and Facebook run the website's sign-in in a secure sheet, which hands back a one-time code.
  const returnUrl = 'bingetube://auth'
  const result = await WebBrowser.openAuthSessionAsync(`${API_BASE}/api/auth/oauth/${p}/start?app=1`, returnUrl, {
    preferEphemeralSession: false,
  })
  if (result.type !== 'success') throw new Cancelled()
  const query = Linking.parse(result.url).queryParams ?? {}
  const error = typeof query.error === 'string' ? query.error : null
  if (error === 'cancelled') throw new Cancelled()
  if (error) throw new ApiError(0, ERRORS[error] ?? 'Sign-in failed. Please try again.')
  await api.post('/auth/app/exchange', { code: query.code })
}
