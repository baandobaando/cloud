import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { before, describe, test } from 'node:test'

// Configure an isolated database and fake processor credentials before importing server modules.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'reelflix-test-'))
process.env.NOWPAYMENTS_API_KEY = 'np_key'
process.env.NOWPAYMENTS_IPN_SECRET = 'np_ipn_secret'
process.env.BTCPAY_URL = 'https://btcpay.example.com'
process.env.BTCPAY_API_KEY = 'btc_key'
process.env.BTCPAY_STORE_ID = 'store1'
process.env.BTCPAY_WEBHOOK_SECRET = 'btc_webhook_secret'

const { db } = await import('./db.ts')
const { fulfillOrder } = await import('./billing.ts')
const { nowpayments } = await import('./payments/nowpayments.ts')
const { btcpay } = await import('./payments/btcpay.ts')
const { WebhookSignatureError } = await import('./payments/types.ts')
const { getSubscription } = await import('./models.ts')

const DAY = 24 * 60 * 60 * 1000

function npSign(payload: Record<string, unknown>, secret = 'np_ipn_secret') {
  const sorted = Object.fromEntries(Object.keys(payload).sort().map((k) => [k, payload[k]]))
  return crypto.createHmac('sha512', secret).update(JSON.stringify(sorted)).digest('hex')
}

let userId: number
function createOrder(id: string, months = 1, provider = 'nowpayments', amountCents = 999) {
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

describe('NOWPayments IPN', () => {
  const payload = {
    payment_id: 123,
    payment_status: 'finished',
    order_id: 'order-1',
    price_amount: 9.99,
    price_currency: 'usd',
    pay_currency: 'btc',
    invoice_id: 555,
  }

  test('accepts a correctly signed payload (keys in any order)', async () => {
    const body = Buffer.from(JSON.stringify({ ...payload, invoice_id: 555, payment_id: 123 }))
    const result = await nowpayments.parseWebhook(body, { 'x-nowpayments-sig': npSign(payload) })
    assert.deepEqual(result, { orderId: 'order-1', invoiceId: '555', status: 'paid', amountCents: 999, payCurrency: 'BTC' })
  })

  test('rejects a tampered payload', async () => {
    const sig = npSign(payload)
    const body = Buffer.from(JSON.stringify({ ...payload, price_amount: 1000 }))
    await assert.rejects(nowpayments.parseWebhook(body, { 'x-nowpayments-sig': sig }), WebhookSignatureError)
  })

  test('rejects a payload signed with the wrong secret', async () => {
    const body = Buffer.from(JSON.stringify(payload))
    await assert.rejects(
      nowpayments.parseWebhook(body, { 'x-nowpayments-sig': npSign(payload, 'wrong') }),
      WebhookSignatureError,
    )
  })

  test('rejects a missing signature', async () => {
    await assert.rejects(nowpayments.parseWebhook(Buffer.from('{}'), {}), WebhookSignatureError)
  })

  test('maps processor statuses', async () => {
    for (const [np, ours] of [['waiting', 'pending'], ['confirming', 'confirming'], ['partially_paid', 'pending'], ['expired', 'expired']]) {
      const p = { ...payload, payment_status: np }
      const r = await nowpayments.parseWebhook(Buffer.from(JSON.stringify(p)), { 'x-nowpayments-sig': npSign(p) })
      assert.equal(r?.status, ours, np)
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
