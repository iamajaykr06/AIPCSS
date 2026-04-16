import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const backendTarget = process.env.VITE_BACKEND_TARGET || 'http://127.0.0.1:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendTarget,
        ws: true,
        changeOrigin: true,
        // Suppress proxy errors when backend is not running
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.warn('[Vite Proxy] Socket.IO proxy error (backend may not be running):', err.message)
          })
          proxy.on('proxyReqWs', (proxyReq, _req, socket) => {
            socket.on('error', (err) => {
              console.warn('[Vite Proxy] WebSocket error:', err.message)
            })
          })
        },
      },
    },
  },
})
