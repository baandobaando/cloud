# BingeTube

A Netflix-style streaming app for vertical short dramas (like ReelShort / DramaBox). Members subscribe monthly through **Stripe** (card, Apple Pay, Google Pay), with a free trial for new accounts, in place of coins or per-episode unlocks.

## What's inside

**For viewers**
- **Accounts and profiles.** Sign up, then pick from up to 5 "Who's watching?" profiles, each with its own My List and watch progress.
- **Netflix-style browsing.** A hero banner, Continue Watching, Top 10, New Releases, genre rows, New & Hot and Search.
- **Vertical swipe player.** One full-screen episode per swipe, with autoplay of the next episode, resume, and an episode picker.
- **Free episodes, then a paywall.** Each series sets its own number of free episodes.
- **Stripe checkout.** Choose a pass length (1 month, 3 months or 12 months, longer passes discounted), then pay on Stripe's hosted Checkout page by card, Apple Pay or Google Pay. **BTCPay Server** (BTC/Lightning) is still supported as an optional extra if its keys are set.
- **Account page.** Shows the membership end date and payment history, and lets you change your password. A renewal reminder appears when 5 or fewer days are left.

**For admins (`/admin`)**
- **Dashboard.** Members, monthly run-rate, 30-day revenue, conversion, members by plan, most-watched series and recent payments.
- **Series.** Create, edit, publish/unpublish and delete series. Upload a poster or use generated art. Set free episodes, genres, rating, "NEW" badge and trending rank.
- **Episodes.** Bulk-upload video files as new episodes (with progress bars), upload or link a video per episode, rename, reorder and delete.
- **Orders.** Every checkout is listed with its status. **Mark paid** handles underpaid invoices you resolved by hand.
- **Users.** Search, grant free access (comp), revoke access, and make or remove admins.

## Security

- **Locked episodes stay locked on the server.** The API never sends their video links to non-members, and uploaded videos are only streamed to viewers who are allowed to watch them.
- **Payments are confirmed only through signed webhooks.** Stripe webhooks are checked against the `Stripe-Signature` header (HMAC-SHA256 with a 5-minute replay window) and BTCPay uses HMAC-SHA256. BTCPay statuses are re-checked against the BTCPay API. Fulfilment is idempotent, so a webhook delivered twice doesn't grant time twice. If a webhook is missed, the order page falls back to polling the processor.
- **Logins.** Passwords are hashed with scrypt. Sessions use httpOnly, SameSite cookies. Login attempts are rate-limited, and cross-site requests are blocked.

## Run locally

Requires Node.js 22.18 or newer (it uses Node's built-in SQLite and TypeScript support).

```bash
npm install
npm run dev        # API on :3001 + web app on http://localhost:5173
```

- **Admin login:** `admin@bingetube.local` / `admin12345` (local development only).
- **Test checkout:** With no processor keys set, a **Test checkout** payment option simulates a payment, so you can try the whole flow. It is automatically disabled in production.

```bash
npm test           # payment & webhook tests
npm run typecheck
```

## Deploy

1. Copy `.env.example` to `.env` and fill it in: `APP_URL`, admin credentials, and keys for at least one processor.
2. Build and start:
   ```bash
   npm ci && npm run build
   node --env-file=.env --no-warnings server/index.ts   # serves the API and the built app
   ```
3. Keep `DATA_DIR` on a persistent disk (it holds the database and uploads), and run behind HTTPS.
4. Set up the webhooks for your processors:
   - **Stripe:** Developers → Webhooks → add `https://YOUR_APP_URL/api/billing/webhooks/stripe` with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`, then set `STRIPE_WEBHOOK_SECRET` to its signing secret and `STRIPE_SECRET_KEY` to your secret key.
   - **BTCPay:** add a webhook to `https://YOUR_APP_URL/api/billing/webhooks/btcpay` for invoice events.

## How memberships work

Members subscribe through **Stripe Billing**: a 3-day free trial for new accounts (card required, one per account), then $9.99 a month until they cancel from the Account page (access runs to the end of the paid month). Access mirrors the Stripe subscription, kept in sync by webhooks (`checkout.session.completed`, `invoice.paid`, `customer.subscription.updated` / `.deleted`). Promotion codes created in the Stripe dashboard work at checkout. Prepaid passes remain for other processors (BTCPay, test checkout).

## Videos: Bunny Stream

1. Put `BUNNY_LIBRARY_ID`, `BUNNY_LIBRARY_KEY`, `BUNNY_CDN_HOST` and `BUNNY_TOKEN_KEY` in `.env` (see `.env.example`).
2. `npm run bunny:check` confirms API access and which token-signing mode your CDN accepts.
3. Admin → Series → **Import from Bunny**: each collection becomes a series, each finished video an episode
   (ordered by `epNN` in the title). The server also syncs automatically every `BUNNY_SYNC_MINUTES` (default 5).
4. Playback uses short-lived signed HLS links, issued only for episodes the viewer may watch.

`node --env-file=.env scripts/bunny-keep-highest.mjs [--dry-run]` deletes every resolution except the highest on
finished videos (single-resolution videos and original files are kept).

## Project layout

| Path | What |
| --- | --- |
| `server/` | Express API: auth, catalog, billing, admin, media |
| `server/payments/` | Stripe, BTCPay and test providers, all behind one interface |
| `shared/types.ts` | Types, plans and pricing shared by server and web |
| `src/` | React web app |
| `src/admin/` | Admin panel, loaded only by admins |

## Before launch

- **Video delivery.** For a large catalog, put videos on a CDN or video host (Bunny Stream, Cloudflare Stream, Mux) and paste their links into episodes. The built-in upload suits small catalogs, and links pasted from elsewhere aren't protected by the server's access check.
- **Account emails.** Add an email service for password resets and renewal reminders.
- **Legal.** Check Stripe's restricted-business list and the rules for your region and the rules for your region.
