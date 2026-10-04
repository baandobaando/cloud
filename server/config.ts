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
  nowpayments: {
    apiKey: env.NOWPAYMENTS_API_KEY ?? '',
    ipnSecret: env.NOWPAYMENTS_IPN_SECRET ?? '',
    sandbox: env.NOWPAYMENTS_SANDBOX === 'true',
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
  },
  adminEmail: env.ADMIN_EMAIL ?? (isProduction ? '' : 'admin@bingetube.local'),
  adminPassword: env.ADMIN_PASSWORD ?? (isProduction ? '' : 'admin12345'),
  /** Test checkout (no real charge). Never available in production. */
  allowTestBilling: !isProduction && env.TEST_BILLING !== 'off',
}

if (isProduction && !config.appUrl) {
  throw new Error('APP_URL must be set in production')
}
