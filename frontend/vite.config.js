import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    host: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '삐뚤',
        short_name: '삐뚤',
        description: '삐뚤 PWA',
        theme_color: '#ffe068',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
  { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})