// Runs the API server (with auto-restart) and the Vite dev server together.
// Uses the current Node binary and Vite's JS entry directly, so it works on Windows, macOS and Linux.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')

const procs = [
  spawn(process.execPath, ['--watch', '--no-warnings', 'server/index.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, [viteBin], { stdio: 'inherit' }),
]

const stop = () => {
  for (const p of procs) p.kill()
  process.exit()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const p of procs) {
  p.on('error', (err) => {
    console.error(err.message)
    stop()
  })
  p.on('exit', (code) => code && stop())
}
