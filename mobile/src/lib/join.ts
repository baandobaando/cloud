import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import type { Me } from './types'

/** Opens the membership screen, going through sign-up first for someone without an account. */
export function startJoin(me: Me | null | undefined) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
  if (me) router.push('/paywall')
  else router.push({ pathname: '/(auth)/signup', params: { next: '/paywall' } })
}

/** Whether to show join prompts: everyone who isn't a member yet. */
export const needsJoin = (me: Me | null | undefined) => me !== undefined && !me?.isEntitled
