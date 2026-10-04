// Checks the Bunny Stream setup: API access, and which token-signing mode the CDN accepts.
// Usage: node --env-file=.env scripts/bunny-check.mjs
import { signCdnUrl } from '../server/bunny.ts'

const { BUNNY_LIBRARY_ID: lib, BUNNY_LIBRARY_KEY: key, BUNNY_CDN_HOST: host, BUNNY_TOKEN_KEY: tokenKey } = process.env
if (!lib || !key || !host) {
  console.error('Set BUNNY_LIBRARY_ID, BUNNY_LIBRARY_KEY and BUNNY_CDN_HOST first.')
  process.exit(1)
}
const res = await fetch(`https://video.bunnycdn.com/library/${lib}/videos?page=1&itemsPerPage=50&orderBy=date`, {
  headers: { AccessKey: key, Accept: 'application/json' },
})
console.log(`API access: HTTP ${res.status}${res.ok ? ' ✓' : ' ✗ (check BUNNY_LIBRARY_KEY)'}`)
if (!res.ok) process.exit(1)
const video = (await res.json()).items.find((v) => v.status === 4)
if (!video) {
  console.log('No finished videos yet to test playback with.')
  process.exit(0)
}
const path = `/${video.guid}/playlist.m3u8`
// Browsers always send a Referer, so test the way the app's player requests videos.
const ref = { headers: { Referer: 'https://reelflix.example/' } }
const plain = await fetch(`https://${host}${path}`, ref)
if (plain.ok) {
  console.log('Unsigned playlist: HTTP 200 → CDN token authentication is OFF.')
  console.log('  Leave BUNNY_TOKEN_KEY unset (signed links would 404), or turn on CDN token authentication')
  console.log('  in the library Security tab (or the vz-… pull zone → Security) and run this again.')
  process.exit(0)
}
console.log(`Unsigned playlist: HTTP ${plain.status} → token authentication is ON`)
if (!tokenKey) {
  console.log('BUNNY_TOKEN_KEY not set: copy it from the library → Security tab to test signed playback.')
  process.exit(0)
}
const expires = Math.floor(Date.now() / 1000) + 600
for (const mode of ['sha256', 'hmac']) {
  const url = signCdnUrl({ path, expires, tokenPath: `/${video.guid}/`, key: tokenKey, mode, host })
  const r = await fetch(url, ref)
  console.log(`Signed playlist (${mode}): HTTP ${r.status}${r.ok ? ` ✓  → set BUNNY_TOKEN_MODE=${mode}` : ''}`)
}
