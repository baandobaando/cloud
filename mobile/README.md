# BingeTube iPhone app

A native iPhone (and Android) app for BingeTube, built with Expo. It talks to the live site at
https://binge.tube, so series, episodes, accounts and progress are shared with the website.

- **Open to everyone:** browse every series and watch the free episodes without an account. Signing in (a pop-up)
  is only needed for My List, saving progress and membership.
- **Subscriptions through Apple:** the membership screen sells the monthly membership as an App Store subscription
  (with the free trial), via RevenueCat. The server links it to the BingeTube account, so it unlocks the website too.
  It shows everything Apple requires: price and period, trial terms, auto-renewal text, Restore purchases, Terms of Use
  (Apple's standard EULA) and the Privacy Policy.
- **Vertical swipe player:** swipe up for the next episode; progress is saved to the account.
- **Account deletion** is built in (Account → Delete account), as the App Store requires.

## Run it on your phone while developing

```sh
cd mobile
npm install
npx expo start
```

The app uses native video and needs a development build rather than Expo Go:
`npx eas-cli@latest build --profile development --platform ios`, install it on your iPhone, then run `npx expo start`.

## Build and submit to the App Store (no Mac needed)

1. Join the Apple Developer Program ($99/year) at developer.apple.com.
2. Create a free Expo account at expo.dev.
3. From this folder:
   ```sh
   npx eas-cli@latest login
   npx eas-cli@latest build --platform ios --profile production
   ```
   EAS asks for your Apple ID and creates the certificates and the app record for you
   (bundle identifier `tube.binge.app`).
   Before the production build, add `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (see below) as an EAS environment variable for
   the production environment (expo.dev → project → Environment variables), so the build can sell subscriptions.
4. Send the build to TestFlight / App Store Connect:
   ```sh
   npx eas-cli@latest submit --platform ios --latest
   ```
5. In App Store Connect, fill in the listing (see the checklist below) and submit for review, with the subscription
   attached to the same version.

## Subscriptions: one-time setup

**App Store Connect** (appstoreconnect.apple.com)
1. Agreements, Tax and Banking: accept the **Paid Apps** agreement and add bank and tax details (purchases don't work
   until this is active). Optionally join the App Store Small Business Program (15% instead of 30%).
2. Your app → Monetization → Subscriptions: create a subscription group "BingeTube membership", then a subscription:
   - Product ID `bingetube_monthly`, duration 1 month, price $9.99 (Apple sets the other countries).
   - Introductory offer: **Free**, 3 days, for new subscribers.
   - Display name and description, plus a review screenshot of the membership screen.
3. Users and Access → Integrations → In-App Purchase: create an **In-App Purchase key** (for RevenueCat) and note the
   Issuer ID. App Information: also copy the **App-Specific Shared Secret**.

**RevenueCat** (app.revenuecat.com, free until $2.5k monthly revenue)
1. Create a project and add an **App Store** app with bundle id `tube.binge.app`, the In-App Purchase key and the
   shared secret.
2. Products: add `bingetube_monthly`. Entitlements: create **`members`** and attach the product.
   Offerings: make the default offering contain a **Monthly** package with that product.
3. API keys: copy the **public Apple SDK key** (`appl_…`) → `EXPO_PUBLIC_REVENUECAT_IOS_KEY` on EAS; create a **V2 secret key**
   (`sk_…`) → `REVENUECAT_SECRET_KEY` on Render, with the project ID (`proj…`) → `REVENUECAT_PROJECT_ID`.
4. Integrations → Webhooks: URL `https://binge.tube/api/billing/webhooks/revenuecat`, and an Authorization header value
   of your choice → the same value in `REVENUECAT_WEBHOOK_AUTH` on Render.
5. In App Store Connect, set the App Store Server Notifications URL to the one RevenueCat shows (faster updates).

## App Store review checklist

- **Demo account:** create an account on binge.tube and give it free access (Admin → Users → Give access, no end date).
  Put its email and password in the review notes, and say subscriptions can be tested with a Sandbox account.
- **Review notes:** "Short-form drama series we hold distribution rights to (licences available on request). Free
  episodes play without an account; the monthly membership is an auto-renewable App Store subscription. Members who
  subscribe on our website can sign in to watch; the app never links to or mentions other ways to pay."
- **Age rating:** answer the questionnaire to match the content (mature themes, mild language, suggestive themes).
- **App Privacy:** collects email and name (account), purchases, and product interaction (watch history), all linked to
  the account and not used for tracking. No third-party advertising or tracking.
- **URLs:** Privacy `https://binge.tube/privacy`, Support `https://binge.tube/support`, Marketing `https://binge.tube`.
- **Screenshots:** 6.9" iPhone (1320 × 2868) — Home, a show page, the player, the membership screen.
- Don't mention website prices or link to website payments anywhere in the app or its listing.

## Configuration

- API, media, support links and RevenueCat settings: `src/lib/config.ts`
- App name, icon, bundle id: `app.json`
