import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API = `http://localhost:${process.env.API_PORT ?? 3001}`

export default defineConfig(({ mode }) => {
  // `vite build --mode demo` makes a self-contained single-page demo (see scripts/build-demo.mjs).
  const demo = mode === 'demo'
  return {
    plugins: [react()],
    define: demo ? { 'import.meta.env.VITE_DEMO': JSON.stringify('1') } : {},
    base: demo ? './' : '/',
    build: demo
      ? {
          outDir: 'dist-demo',
          assetsInlineLimit: 10 * 1024 * 1024,
          cssCodeSplit: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : {},
    server: {
      proxy: {
        '/api': API,
        '/media': API,
      },
    },
  }
})
