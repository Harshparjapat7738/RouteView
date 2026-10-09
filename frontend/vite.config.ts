import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const DEFAULT_DEV_BACKEND_URL = 'http://localhost:8080'

// Production-only hardening for the built index.html. Only directives that cannot affect Google Maps / Places
// are enforced here; the full policy (script/connect/img sources) belongs in the static host's response
// headers and is documented in docs/security.md. `strict-origin-when-cross-origin` keeps the Referer that the
// referrer-restricted browser key needs, so never use `no-referrer` on the frontend.
const productionSecurityMeta = {
  name: 'routeview-production-security-meta',
  apply: 'build' as const,
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' as const },
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: "object-src 'none'; base-uri 'self'; form-action 'self'" },
      injectTo: 'head-prepend' as const,
    },
  ],
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Loads all variables (not only VITE_*) for use in this config file only.
  // Nothing loaded here is exposed to browser code unless it has the VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      productionSecurityMeta,
      // Installable PWA with a deliberately conservative service worker: it precaches only the built
      // application shell (HTML, JS, CSS, icons). Everything else (the /api calls, Google Maps scripts and
      // tiles, Places) is never cached: routing needs a connection and there is no offline routing.
      VitePWA({
        // A new version waits until the app is reopened, so an update never reloads a route session in use.
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'RouteView',
          short_name: 'RouteView',
          description: 'Discover routes by the geographical areas they pass through.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#0f766e',
          background_color: '#f8fafc',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
          cleanupOutdatedCaches: true,
          // Offline, a navigation opens the cached shell; API paths are never answered from it.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          // No runtimeCaching on purpose: every other request goes straight to the network.
        },
      }),
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // In development the browser calls the Vite server on /api,
        // which forwards to Spring Boot. This avoids CORS during local development.
        '/api': {
          target: env.DEV_BACKEND_URL || DEFAULT_DEV_BACKEND_URL,
          changeOrigin: true,
        },
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          // Libraries change rarely, application code often. Separate files mean an app update re-downloads
          // (and the service worker re-precaches) only the small application chunk, not React and the maps wrapper.
          manualChunks(id: string) {
            if (id.includes('node_modules/@vis.gl')) {
              return 'maps'
            }
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
              return 'react'
            }
            return undefined
          },
        },
      },
    },
  }
})
