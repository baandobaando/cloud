# BingeTube iPhone app

A native iPhone (and Android) app for BingeTube, built with Expo. It talks to the live site at
https://binge.tube, so series, episodes, accounts and progress are shared with the website.

- **Members only:** people create a free account (or sign in) to use the app.
- **No purchases in the app.** Episodes a viewer's account doesn't include show a "not available yet" screen.
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
4. Send the build to TestFlight / App Store Connect:
   ```sh
   npx eas-cli@latest submit --platform ios --latest
   ```
5. In App Store Connect, fill in the listing (screenshots, description, age rating, privacy details,
   privacy policy URL `https://binge.tube/privacy`, support email) and submit for review.
   Give Apple a demo account (email + password) in the review notes so they can sign in.

## Configuration

- API and media settings: `src/lib/config.ts`
- App name, icon, bundle id: `app.json`
