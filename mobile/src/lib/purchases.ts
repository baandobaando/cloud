import { Platform } from 'react-native'
import Purchases, { type PurchasesPackage } from 'react-native-purchases'
import { ENTITLEMENT, REVENUECAT_IOS_KEY } from './config'

/**
 * App Store subscriptions through RevenueCat. Purchases are tied to the BingeTube account (our user id is the
 * RevenueCat app user id), and the server learns about them from RevenueCat, so membership works on the website too.
 */

export const purchasesAvailable = Platform.OS === 'ios' && !!REVENUECAT_IOS_KEY
let configured = false

export function configurePurchases() {
  if (!purchasesAvailable || configured) return
  Purchases.configure({ apiKey: REVENUECAT_IOS_KEY })
  configured = true
}

/** Links App Store purchases to the signed-in account (or back to an anonymous user after sign-out). */
export async function identifyPurchaser(userId: number | null) {
  if (!configured) return
  try {
    if (userId) await Purchases.logIn(String(userId))
    else if (!(await Purchases.isAnonymous())) await Purchases.logOut()
  } catch {
    /* identity is retried on the next sign-in or purchase */
  }
}

export interface MonthlyOffer {
  pkg: PurchasesPackage
  /** Localized price, e.g. "$9.99". */
  price: string
  /** Free-trial length in days when this Apple ID can still get it, otherwise 0. */
  trialDays: number
}

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 }

/** The monthly membership from the current RevenueCat offering, with this Apple ID's trial eligibility. */
export async function loadMonthlyOffer(): Promise<MonthlyOffer | null> {
  if (!configured) return null
  const offerings = await Purchases.getOfferings()
  const pkg = offerings.current?.monthly ?? offerings.current?.availablePackages[0]
  if (!pkg) return null
  let trialDays = 0
  const intro = pkg.product.introPrice
  if (intro && intro.price === 0) {
    const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility([pkg.product.identifier]).catch(() => null)
    const status = eligibility?.[pkg.product.identifier]?.status
    // 0 = unknown, 1 = ineligible, 2 = eligible (RevenueCat INTRO_ELIGIBILITY_STATUS).
    if (status !== 1) trialDays = intro.periodNumberOfUnits * (UNIT_DAYS[intro.periodUnit] ?? 1)
  }
  return { pkg, price: pkg.product.priceString, trialDays }
}

/** Buys the package. Returns true when the membership is active afterwards, false if the buyer cancelled. */
export async function buy(pkg: PurchasesPackage): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg)
    return !!customerInfo.entitlements.active[ENTITLEMENT]
  } catch (err) {
    if ((err as { userCancelled?: boolean }).userCancelled) return false
    throw err
  }
}

/** Restores App Store purchases made with this Apple ID. Returns whether a membership was found. */
export async function restore(): Promise<boolean> {
  if (!configured) return false
  const info = await Purchases.restorePurchases()
  return !!info.entitlements.active[ENTITLEMENT]
}
