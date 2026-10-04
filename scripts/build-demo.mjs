// Packs the demo build into one HTML file (CSS, JS and video clips inlined) for single-page hosting.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

execSync('npx vite build --mode demo', { stdio: 'inherit' })

const dir = 'dist-demo'
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
const read = (ref) => fs.readFileSync(path.join(dir, ref.replace(/^\.\//, '')), 'utf8')

const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].filter((m) => !/^https?:/.test(m[1])).map((m) => read(m[1])).join('\n')
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"/g)].map((m) => read(m[1])).join('\n')
if (!css || !js) throw new Error('Could not find built CSS/JS in dist-demo/index.html')

// "</script" inside inline JS would end the script element early.
const safeJs = js.replace(/<\/script/gi, '<\\/script')

const out = `<title>BingeTube</title>
<meta name="theme-color" content="#0a0a0b">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>
`
fs.writeFileSync(path.join(dir, 'bingetube-demo.html'), out)
console.log(`Wrote ${dir}/bingetube-demo.html (${(out.length / 1024).toFixed(0)} KB)`)
