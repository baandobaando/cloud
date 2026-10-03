# ReelFlix

A Netflix-style streaming app for vertical short dramas (think ReelShort / DramaBox), with **one flat subscription in place of coins and per-episode unlocks**.

## Features

- **"Who's watching?" profiles.** Each profile has its own My List and watch progress.
- **Netflix-style browsing.** A hero banner, Continue Watching, Top 5 Today, New Releases and genre rows.
- **Series page.** Synopsis, the full episode list with lock icons, and More Like This.
- **Vertical swipe player.** One full-screen 9:16 episode per swipe. The next episode starts automatically, playback resumes where you left off, and there's an episode picker. On desktop you can use the arrow keys.
- **Paywall.** Episodes 1–5 are free and later episodes prompt you to subscribe. There are Basic, Standard and Premium plans.
- **New & Hot, Search and My List** pages.
- **Responsive layout.** Desktop gets a top nav and mobile gets bottom tabs.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build
```

## Where things live

| Path | What |
| --- | --- |
| `src/data/catalog.ts` | Series, episodes, plans, `FREE_EPISODES` |
| `src/state/AppState.tsx` | Profiles, subscription, My List, progress (saved to localStorage) |
| `src/pages/Watch.tsx` | Vertical swipe player + paywall |
| `src/pages/*` | Home, Title, Plans, New & Hot, My List, Search, Profile picker |
| `src/components/*` | Navbar, Hero, Row, generated Poster art |

## Demo limitations / next steps

- Episodes use public sample clips in place of real footage. To use your own, replace `videoUrl` in the catalog, ideally with HLS streams from Mux or Cloudflare Stream.
- Subscribing is simulated and no payment is taken. Add Stripe on the web, or App Store / Play billing in the native apps.
- All data is stored in the browser. A real launch needs a backend for accounts, the catalog and entitlements.
