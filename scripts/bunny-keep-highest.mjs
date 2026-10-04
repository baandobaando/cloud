// Deletes every resolution except the highest one on finished Bunny Stream videos.
// Videos with a single resolution are left alone. Original source files are never deleted.
// Usage: node --env-file=.env scripts/bunny-keep-highest.mjs [--dry-run] [--limit N] [--video <guid>] [--concurrency N]
const { BUNNY_LIBRARY_ID: lib, BUNNY_LIBRARY_KEY: key } = process.env
if (!lib || !key) {
  console.error('Set BUNNY_LIBRARY_ID and BUNNY_LIBRARY_KEY first.')
  process.exit(1)
}
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity
const only = args.includes('--video') ? args[args.indexOf('--video') + 1] : null
const concurrency = args.includes('--concurrency') ? Number(args[args.indexOf('--concurrency') + 1]) : 4
const base = `https://video.bunnycdn.com/library/${lib}`
const headers = { AccessKey: key, Accept: 'application/json' }

async function call(url, init = {}, tries = 4) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { ...init, headers })
    if (res.ok) return res.json()
    if (i >= tries || (res.status < 500 && res.status !== 429)) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i))
  }
}

const heightOf = (r) => Number.parseInt(r, 10) || 0

let videos = []
for (let page = 1; ; page++) {
  const d = await call(`${base}/videos?page=${page}&itemsPerPage=1000&orderBy=date`)
  videos.push(...d.items)
  if (page * 1000 >= d.totalItems || d.items.length === 0) break
}
if (only) videos = videos.filter((v) => v.guid === only)

const jobs = []
let skippedSingle = 0
let skippedUnfinished = 0
for (const v of videos) {
  if (v.status !== 4) {
    skippedUnfinished++
    continue
  }
  const res = (v.availableResolutions ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (res.length <= 1) {
    skippedSingle++
    continue
  }
  const highest = res.reduce((a, b) => (heightOf(b) > heightOf(a) ? b : a))
  jobs.push({ v, highest, remove: res.filter((r) => r !== highest) })
}
const todo = jobs.slice(0, limit)
console.log(`${videos.length} videos · ${jobs.length} have extra resolutions · ${skippedSingle} already single · ${skippedUnfinished} still processing (skipped)`)
console.log(dryRun ? 'DRY RUN: nothing will be deleted.' : `Cleaning ${todo.length} videos…`)

let done = 0
let failed = 0
const queue = [...todo]
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const q = new URLSearchParams({
        resolutionsToDelete: job.remove.join(','),
        deleteMp4Files: 'true',
        deleteOriginal: 'false',
        dryRun: String(dryRun),
      })
      try {
        const r = await call(`${base}/videos/${job.v.guid}/resolutions/cleanup?${q}`, { method: 'POST' })
        done++
        const after = r?.data?.availableResolutionsAfter ?? r?.availableResolutionsAfter
        if (todo.length <= 5 || done % 100 === 0) {
          console.log(`  ${job.v.title}: keep ${job.highest}, remove ${job.remove.join(',')}${after ? ` → now ${after}` : ''}`)
        }
      } catch (err) {
        failed++
        console.log(`  ✗ ${job.v.title} (${job.v.guid}): ${err.message}`)
      }
      if ((done + failed) % 250 === 0) console.log(`  progress: ${done + failed}/${todo.length}`)
    }
  }),
)
console.log(`Finished: ${done} cleaned, ${failed} failed.`)
