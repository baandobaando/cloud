import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { before, describe, test } from 'node:test'

// Configure an isolated database and fake processor credentials before importing server modules.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'reelflix-test-'))
process.env.STRIPE_SECRET_KEY = 'sk_test_key'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
process.env.BTCPAY_URL = 'https://btcpay.example.com'
process.env.BTCPAY_API_KEY = 'btc_key'
process.env.BTCPAY_STORE_ID = 'store1'
process.env.BTCPAY_WEBHOOK_SECRET = 'btc_webhook_secret'

const { db } = await import('./db.ts')
const { fulfillOrder } = await import('./billing.ts')
const { stripeProvider, checkStripeAccount } = await import('./payments/stripe.ts')
const { btcpay } = await import('./payments/btcpay.ts')
const { WebhookSignatureError } = await import('./payments/types.ts')
const { getSubscription } = await import('./models.ts')

const DAY = 24 * 60 * 60 * 1000

let userId: number
function createOrder(id: string, months = 1, provider = 'btcpay', amountCents = 999) {
  db.prepare(
    `INSERT INTO orders (id, user_id, plan, months, amount_cents, provider, status, created_at)
     VALUES (?, ?, 'member', ?, ?, ?, 'pending', ?)`,
  ).run(id, userId, months, amountCents, provider, Date.now())
}

before(() => {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES ('buyer@test.com', 'x', 'Buyer', ?)")
    .run(Date.now())
  userId = Number(lastInsertRowid)
})

describe('Stripe webhook', () => {
  const session = { id: 'cs_test_1', object: 'checkout.session', client_reference_id: 'order-1', amount_total: 999, currency: 'usd', payment_status: 'paid' }
  const event = (type: string, obj: Record<string, unknown> = session) => Buffer.from(JSON.stringify({ id: 'evt_1', type, data: { object: obj } }))
  const sign = (body: Buffer, secret = 'whsec_test', t = Math.floor(Date.now() / 1000)) =>
    `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body.toString('utf8')}`).digest('hex')}`

  test('accepts a correctly signed checkout.session.completed', async () => {
    const body = event('checkout.session.completed')
    const result = await stripeProvider.parseWebhook(body, { 'stripe-signature': sign(body) })
    assert.deepEqual(result, { orderId: 'order-1', invoiceId: 'cs_test_1', status: 'paid', amountCents: 999, payCurrency: 'CARD' })
  })

  test('accepts any of several v1 signatures (secret rotation)', async () => {
    const body = event('checkout.session.completed')
    const good = sign(body)
    const header = `${good.split(',')[0]},v1=${'0'.repeat(64)},${good.split(',')[1]}`
    assert.equal((await stripeProvider.parseWebhook(body, { 'stripe-signature': header }))?.status, 'paid')
  })

  test('rejects a tampered payload', async () => {
    const header = sign(event('checkout.session.completed'))
    const tampered = event('checkout.session.completed', { ...session, amount_total: 1 })
    await assert.rejects(stripeProvider.parseWebhook(tampered, { 'stripe-signature': header }), WebhookSignatureError)
  })

  test('rejects the wrong secret, a stale timestamp and a missing header', async () => {
    const body = event('checkout.session.completed')
    await assert.rejects(stripeProvider.parseWebhook(body, { 'stripe-signature': sign(body, 'whsec_other') }), WebhookSignatureError)
    const old = Math.floor(Date.now() / 1000) - 3600
    await assert.rejects(stripeProvider.parseWebhook(body, { 'stripe-signature': sign(body, 'whsec_test', old) }), WebhookSignatureError)
    await assert.rejects(stripeProvider.parseWebhook(body, {}), WebhookSignatureError)
  })

  test('maps checkout events to order statuses', async () => {
    const cases: [string, Record<string, unknown>, string | null][] = [
      ['checkout.session.completed', { ...session, payment_status: 'unpaid' }, 'confirming'],
      ['checkout.session.async_payment_succeeded', session, 'paid'],
      ['checkout.session.async_payment_failed', session, 'failed'],
      ['checkout.session.expired', session, 'expired'],
      ['payment_intent.created', session, null],
    ]
    for (const [type, obj, want] of cases) {
      const body = event(type, obj)
      const r = await stripeProvider.parseWebhook(body, { 'stripe-signature': sign(body) })
      assert.equal(r?.status ?? null, want, type)
    }
  })

  test('creates a one-time Checkout Session for the order', async () => {
    const realFetch = globalThis.fetch
    let sent: URLSearchParams | undefined
    let auth = ''
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams
      auth = (init.headers as Record<string, string>).Authorization
      return new Response(JSON.stringify({ id: 'cs_new', url: 'https://checkout.stripe.com/c/pay/cs_new' }), { status: 200 })
    }) as typeof fetch
    try {
      const r = await stripeProvider.createInvoice({ orderId: 'o-9', amountCents: 2697, description: 'Pass', returnUrl: 'https://x/ok', cancelUrl: 'https://x/plans', email: 'a@b.co' })
      assert.deepEqual(r, { invoiceId: 'cs_new', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_new' })
      assert.equal(auth, 'Bearer sk_test_key')
      assert.equal(sent!.get('mode'), 'payment')
      assert.equal(sent!.get('client_reference_id'), 'o-9')
      assert.equal(sent!.get('line_items[0][price_data][unit_amount]'), '2697')
      assert.equal(sent!.get('cancel_url'), 'https://x/plans')
      assert.equal(sent!.get('customer_email'), 'a@b.co')
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('Stripe account check', () => {
  const withAccount = async (account: Record<string, unknown>) => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify(account), { status: 200 })) as typeof fetch
    try {
      return await checkStripeAccount()
    } finally {
      globalThis.fetch = realFetch
    }
  }

  test('hides checkout while Stripe has charges or card payments off, and shows it once enabled', async () => {
    assert.equal(stripeProvider.isConfigured(), true, 'available before the first check')
    const off = await withAccount({ charges_enabled: false, capabilities: { card_payments: 'inactive' }, requirements: { currently_due: [] } })
    assert.equal(off?.ready, false)
    assert.match(off!.problem!, /not enabled charges/)
    assert.equal(stripeProvider.isConfigured(), false)

    const inactiveCards = await withAccount({ charges_enabled: true, capabilities: { card_payments: 'pending' } })
    assert.match(inactiveCards!.problem!, /Card payments are pending/)
    assert.equal(stripeProvider.isConfigured(), false)

    const on = await withAccount({ charges_enabled: true, capabilities: { card_payments: 'active' }, business_profile: { name: 'BingeTube' } })
    assert.deepEqual([on?.ready, on?.accountName], [true, 'BingeTube'])
    assert.equal(stripeProvider.isConfigured(), true)
  })

  test('keeps the last result if Stripe cannot be reached', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => { throw new Error('network down') }) as typeof fetch
    try {
      assert.equal((await checkStripeAccount())?.ready, true)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('BTCPay webhook', () => {
  const sign = (body: Buffer, secret = 'btc_webhook_secret') =>
    'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

  test('verifies the signature and asks BTCPay for the authoritative status', async () => {
    const realFetch = globalThis.fetch
    let calledUrl = ''
    globalThis.fetch = (async (url: string) => {
      calledUrl = url
      return new Response(JSON.stringify({ status: 'Settled' }), { status: 200 })
    }) as typeof fetch
    try {
      const body = Buffer.from(JSON.stringify({ type: 'InvoiceSettled', invoiceId: 'inv_9' }))
      const result = await btcpay.parseWebhook(body, { 'btcpay-sig': sign(body) })
      assert.deepEqual(result, { invoiceId: 'inv_9', status: 'paid' })
      assert.equal(calledUrl, 'https://btcpay.example.com/api/v1/stores/store1/invoices/inv_9')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('rejects a bad signature', async () => {
    const body = Buffer.from(JSON.stringify({ type: 'InvoiceSettled', invoiceId: 'inv_9' }))
    await assert.rejects(btcpay.parseWebhook(body, { 'btcpay-sig': sign(body, 'nope') }), WebhookSignatureError)
  })
})

describe('fulfillOrder', () => {
  test('a Stripe order is recorded as a card pass', () => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES ('card@test.com', 'x', 'Card', ?)")
      .run(Date.now())
    const cardUser = Number(lastInsertRowid)
    db.prepare(
      `INSERT INTO orders (id, user_id, plan, months, amount_cents, provider, status, created_at) VALUES ('s-1', ?, 'member', 1, 999, 'stripe', 'pending', ?)`,
    ).run(cardUser, Date.now())
    assert.equal(fulfillOrder('s-1', 'CARD'), true)
    assert.equal(getSubscription(cardUser)!.source, 'card')
  })

  test('grants access, and a repeated notification is a no-op', () => {
    createOrder('f-1', 1)
    const before = Date.now()
    assert.equal(fulfillOrder('f-1', 'BTC'), true)
    assert.equal(fulfillOrder('f-1', 'BTC'), false)

    const sub = getSubscription(userId)!
    assert.equal(sub.plan, 'member')
    assert.equal(sub.source, 'crypto')
    assert.ok(sub.currentPeriodEnd! >= before + 30 * DAY && sub.currentPeriodEnd! <= Date.now() + 30 * DAY)

    const { n } = db.prepare("SELECT COUNT(*) AS n FROM payments WHERE order_id = 'f-1'").get() as { n: number }
    assert.equal(n, 1)
  })

  test('stacks a new pass on top of remaining time', () => {
    const endBefore = getSubscription(userId)!.currentPeriodEnd!
    createOrder('f-2', 3)
    fulfillOrder('f-2')
    assert.equal(getSubscription(userId)!.currentPeriodEnd, endBefore + 90 * DAY)
  })

  test('starts from now when the previous pass has expired', () => {
    db.prepare('UPDATE subscriptions SET current_period_end = ? WHERE user_id = ?').run(Date.now() - 10 * DAY, userId)
    createOrder('f-3', 1)
    const before = Date.now()
    fulfillOrder('f-3')
    const end = getSubscription(userId)!.currentPeriodEnd!
    assert.ok(end >= before + 30 * DAY && end <= Date.now() + 30 * DAY)
  })
})

describe('Monthly subscriptions', async () => {
  const { applyStripeSubscription, handleSubscriptionEvent, completeSubscriptionOrder, trialEligible } = await import('./subscriptions.ts')
  const { isActive } = await import('./models.ts')
  const day = 24 * 60 * 60
  let subUser: number
  const nowS = () => Math.floor(Date.now() / 1000)
  const sub = (over: Record<string, unknown> = {}) => ({
    id: 'sub_1', customer: 'cus_1', status: 'trialing', cancel_at_period_end: false,
    current_period_end: nowS() + 3 * day, trial_end: nowS() + 3 * day, metadata: { user_id: String(subUser) }, ...over,
  })
  const withFetch = async <T>(responses: Record<string, unknown>, fn: () => Promise<T>) => {
    const real = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      const key = Object.keys(responses).find((k) => url.includes(k))
      return new Response(JSON.stringify(key ? responses[key] : {}), { status: key ? 200 : 404 })
    }) as typeof fetch
    try { return await fn() } finally { globalThis.fetch = real }
  }

  before(() => {
    const { lastInsertRowid } = db.prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES ('sub@test.com', 'x', 'Sub', ?)").run(Date.now())
    subUser = Number(lastInsertRowid)
  })

  test('a new account can trial; the trial gives access until it ends and uses up the trial', () => {
    assert.equal(trialEligible(subUser), true)
    assert.equal(applyStripeSubscription(sub()), subUser)
    const s = getSubscription(subUser)!
    assert.equal(isActive(s), true)
    assert.equal(s.renews, true)
    assert.ok(s.trialEndsAt && s.trialEndsAt > Date.now())
    assert.equal(trialEligible(subUser), false)
  })

  test('cancelling keeps access to the end of the period, then deletion ends it', () => {
    applyStripeSubscription(sub({ status: 'active', trial_end: null, cancel_at_period_end: true, current_period_end: nowS() + 20 * day }))
    let s = getSubscription(subUser)!
    assert.deepEqual([s.renews, s.cancelAtPeriodEnd, isActive(s)], [false, true, true])
    applyStripeSubscription(sub({ status: 'canceled', ended_at: nowS() - 1 }))
    s = getSubscription(subUser)!
    assert.equal(isActive(s), false)
    assert.equal(s.renews, false)
  })

  test('reads the period end from the subscription item on newer Stripe API versions', () => {
    const end = nowS() + 31 * day
    applyStripeSubscription(sub({ status: 'active', trial_end: null, current_period_end: undefined, items: { data: [{ current_period_end: end }] } }))
    assert.equal(getSubscription(subUser)!.currentPeriodEnd, end * 1000)
  })

  test('invoice.paid renews access and records the charge exactly once', async () => {
    const end = nowS() + 30 * day
    const event = { type: 'invoice.paid', data: { object: { id: 'in_1', amount_paid: 999, currency: 'usd', subscription: 'sub_1' } } }
    await withFetch({ '/subscriptions/sub_1': sub({ status: 'active', trial_end: null, current_period_end: end }) }, async () => {
      await handleSubscriptionEvent(event)
      await handleSubscriptionEvent(event)
    })
    assert.equal(getSubscription(subUser)!.currentPeriodEnd, end * 1000)
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM payments WHERE provider_ref = 'in_1'").get() as { n: number }
    assert.equal(n, 1)
  })

  test('a $0 trial invoice is not recorded as revenue', async () => {
    await withFetch({ '/subscriptions/sub_1': sub() }, () =>
      handleSubscriptionEvent({ type: 'invoice.paid', data: { object: { id: 'in_trial', amount_paid: 0, parent: { subscription_details: { subscription: 'sub_1' } } } } }),
    )
    assert.equal(db.prepare("SELECT 1 FROM payments WHERE provider_ref = 'in_trial'").get(), undefined)
  })

  test('completing the subscription checkout marks the order paid and links the subscription', async () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES ('sub2@test.com', 'x', 'Sub2', ?)").run(Date.now())
    const user2 = Number(lastInsertRowid)
    db.prepare(
      "INSERT INTO orders (id, user_id, plan, months, amount_cents, provider, provider_invoice_id, status, created_at, kind) VALUES ('so-1', ?, 'member', 1, 0, 'stripe', 'cs_sub', 'pending', ?, 'subscription')",
    ).run(user2, Date.now())
    await withFetch(
      {
        '/checkout/sessions/cs_sub': { status: 'complete', subscription: 'sub_2', customer: 'cus_2' },
        '/subscriptions/sub_2': { id: 'sub_2', customer: 'cus_2', status: 'trialing', current_period_end: nowS() + 3 * day, trial_end: nowS() + 3 * day, metadata: {} },
      },
      () => completeSubscriptionOrder('so-1', 'cs_sub'),
    )
    assert.equal((db.prepare("SELECT status FROM orders WHERE id = 'so-1'").get() as { status: string }).status, 'paid')
    const s = getSubscription(user2)!
    assert.equal(isActive(s), true)
    assert.equal(s.renews, true)
  })
})
