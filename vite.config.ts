import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readdirSync } from 'node:fs'

// Build stamp so the running app can tell whether it is on the newest code.
const BUILD_ID = new Date().toISOString()

// Optional 3D scans in public/models (katrien.glb, eend.glb, ...): only the ones that exist get loaded.
const MODELS = existsSync('public/models')
  ? readdirSync('public/models').filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, ''))
  : []

export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __MODELS__: JSON.stringify(MODELS),
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    VitePWA({
      // 'prompt' so a new version waits until the start screen instead of reloading mid-round.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['sprites/**/*', 'misc/**/*', 'sounds/**/*', 'models/**/*'],
      manifest: {
        name: 'Rainbow Island',
        short_name: 'Rainbow Island',
        description: 'Woordjes oefenen met Katrien op haar eiland',
        lang: 'nl',
        start_url: './index.html',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#bfe3f7',
        theme_color: '#bfe3f7',
        icons: [
          { src: 'misc/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'misc/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'misc/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fresh code wins: the app applies a waiting update as soon as it is on the start screen.
        clientsClaim: true,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,webp,png,svg,json,mp3,glb,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Never serve a stale shell: try the network first, fall back to cache offline.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'kne-pages', networkTimeoutSeconds: 4 },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any)
