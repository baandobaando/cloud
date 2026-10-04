import { useEffect, useState } from 'react'
import { TRIAL_DAYS, type BillingConfig } from '../shared/types'
import { api } from './api'
import { useSession } from './state/Session'

let billing: Promise<BillingConfig> | null = null

/**
 * Whether to pitch the free trial: monthly subscriptions are on and this viewer hasn't used a trial yet
 * (visitors who aren't signed in haven't). Returns the trial length in days, or 0.
 */
export function useTrialOffer(): number {
  const { me } = useSession()
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    billing ??= api.get<BillingConfig>('/billing/config').catch((err) => {
      billing = null
      throw err
    })
    let live = true
    billing.then((b) => live && setEnabled(b.subscription), () => {})
    return () => {
      live = false
    }
  }, [])
  return enabled && (!me || !!me.trialEligible) && !me?.isEntitled ? TRIAL_DAYS : 0
}
