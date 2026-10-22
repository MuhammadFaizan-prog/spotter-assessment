import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, /api is proxied to the Django server so the SPA and API share an origin
// exactly like production on Vercel.
const proxy = {
  '/api': { target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: true },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  worker: { format: 'es' },
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
