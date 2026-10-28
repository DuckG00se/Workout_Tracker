import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  // `npm run dev` + `npx wrangler dev --port 8787` in another terminal gives a local sync backend.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff}'], navigateFallback: 'index.html', navigateFallbackDenylist: [/^\/api\//] },
      manifest: {
        name: 'Logbook — Gym Tracker',
        short_name: 'Logbook',
        description: 'Offline-first strength training log',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1b1712',
        theme_color: '#1b1712',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
