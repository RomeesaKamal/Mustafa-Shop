import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      // We register the service worker ourselves (see the guarded script in
      // index.html) so it can be skipped inside the Capacitor Android app.
      // Letting vite-plugin-pwa also auto-inject its own registration script
      // caused it to register a second time on every load, including inside
      // the native app — part of what produced the white screen on phone.
      injectRegister: false,

      manifest: {
        name: 'Mustafa Shop',
        short_name: 'Mustafa Shop',
        description: 'Mustafa Shop mobile shopping app',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg}']
      }
    })
  ]
})