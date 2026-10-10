import path from 'node:path'

const env = process.env

export const isProduction = env.NODE_ENV === 'production'

export const config = {
  port: Number(env.PORT ?? 3001),
  /** Public URL of the app, used for payment redirect and webhook URLs. */
  // Falls back to the URL that Render / Railway provide automatically.
  appUrl: (
    env.APP_URL ??
    env.RENDER_EXTERNAL_URL ??
    (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : undefined) ??
    (isProduction ? '' : 'http://localhost:5173')
  ).replace(/\/$/, ''),
  dataDir: path.resolve(env.DATA_DIR ?? 'data'),
  /** Stripe Checkout: secret key (sk_live_… / sk_test_…) and the signing secret of the webhook endpoint (whsec_…). */
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
  },
  btcpay: {
    url: (env.BTCPAY_URL ?? '').replace(/\/$/, ''),
    apiKey: env.BTCPAY_API_KEY ?? '',
    storeId: env.BTCPAY_STORE_ID ?? '',
    webhookSecret: env.BTCPAY_WEBHOOK_SECRET ?? '',
  },
  bunny: {
    libraryId: env.BUNNY_LIBRARY_ID ?? '',
    libraryKey: env.BUNNY_LIBRARY_KEY ?? '',
    cdnHost: (env.BUNNY_CDN_HOST ?? '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    /** Token authentication key from the library's Security tab. Without it, playback links are unsigned. */
    tokenKey: env.BUNNY_TOKEN_KEY ?? '',
    /** 'sha256' (classic) or 'hmac' (HS256). `npm run bunny:check` tells you which one your library accepts. */
    tokenMode: (env.BUNNY_TOKEN_MODE === 'hmac' ? 'hmac' : 'sha256') as 'sha256' | 'hmac',
    /** Delete every resolution except the highest on finished videos during each sync (BUNNY_KEEP_HIGHEST_ONLY=off to stop). */
    keepHighestOnly: env.BUNNY_KEEP_HIGHEST_ONLY !== 'off',
    /** Minutes between automatic syncs with Bunny (minimum 1). */
    syncMinutes: Math.max(1, Number(env.BUNNY_SYNC_MINUTES) || 5),
  },
  /**
   * iPhone app subscriptions (Apple in-app purchase) through RevenueCat: the project and its V2 secret API key (sk_…)
   * for looking up a customer, the Authorization value set on the RevenueCat webhook, and the entitlement that means
   * "member".
   */
  revenuecat: {
    projectId: env.REVENUECAT_PROJECT_ID ?? '',
    secretKey: env.REVENUECAT_SECRET_KEY ?? '',
    webhookAuth: env.REVENUECAT_WEBHOOK_AUTH ?? '',
    entitlement: env.REVENUECAT_ENTITLEMENT ?? 'members',
  },
  /** Sign in with Google: an OAuth client (Web application) from Google Cloud Console. */
  google: {
    clientId: env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
  },
  /** Sign in with Apple: a Services ID plus a Sign in with Apple key (.p8) from developer.apple.com. */
  apple: {
    clientId: env.APPLE_CLIENT_ID ?? '',
    teamId: env.APPLE_TEAM_ID ?? '',
    keyId: env.APPLE_KEY_ID ?? '',
    // Env vars usually carry the .p8 file on one line with literal \n.
    privateKey: (env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    /** The iPhone app's bundle ID: native Sign in with Apple tokens are issued for it. */
    bundleId: env.APPLE_BUNDLE_ID ?? 'tube.binge.app',
  },
  /** Log in with Facebook: an app from developers.facebook.com (App ID + App Secret). */
  facebook: {
    appId: env.FACEBOOK_APP_ID ?? '',
    appSecret: env.FACEBOOK_APP_SECRET ?? '',
  },
  /** The iPhone app's URL scheme: Google/Facebook sign-in started from the app returns to it. */
  appScheme: env.APP_SCHEME ?? 'bingetube',
  /** Series with fewer episodes than this stay out of the public catalog until more are uploaded. */
  minEpisodes: Math.max(0, Number(env.MIN_EPISODES ?? 5) || 0),
  adminEmail: env.ADMIN_EMAIL ?? (isProduction ? '' : 'admin@bingetube.local'),
  adminPassword: env.ADMIN_PASSWORD ?? (isProduction ? '' : 'admin12345'),
  /** Test checkout (no real charge). Never available in production. */
  allowTestBilling: !isProduction && env.TEST_BILLING !== 'off',
}

if (isProduction && !config.appUrl) {
  throw new Error('APP_URL must be set in production')
}
