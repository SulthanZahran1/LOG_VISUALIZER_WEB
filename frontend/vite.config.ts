import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  server: {
    proxy: {
      '/api': {
        // Use environment variable or default to localhost
        target: process.env.VITE_API_PROXY_URL || 'http://localhost:8089',
        changeOrigin: true,
        // Enable WebSocket proxy for /api/ws/* endpoints
        ws: true,
      },
    },
  },
})
