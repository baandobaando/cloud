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
  adminEmail: env.ADMIN_EMAIL ?? (isProduction ? '' : 'admin@reelflix.local'),
  adminPassword: env.ADMIN_PASSWORD ?? (isProduction ? '' : 'admin12345'),
  /** Test checkout (no real charge). Never available in production. */
  allowTestBilling: !isProduction && env.TEST_BILLING !== 'off',
}

if (isProduction && !config.appUrl) {
  throw new Error('APP_URL must be set in production')
}
