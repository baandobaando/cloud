// Runs the API server (with auto-restart) and the Vite dev server together.
import { spawn } from 'node:child_process'

const procs = [
  spawn('node', ['--watch', '--no-warnings', 'server/index.ts'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
]

const stop = () => {
  for (const p of procs) p.kill('SIGTERM')
  process.exit()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const p of procs) p.on('exit', (code) => code && stop())
