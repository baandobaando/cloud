import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API = `http://localhost:${process.env.API_PORT ?? 3001}`

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': API,
      '/media': API,
    },
  },
})
