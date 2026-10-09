# PWA and mobile experience

RouteView is an installable Progressive Web App built with `vite-plugin-pwa` (Workbox `generateSW`). It is a route *discovery* app, not an offline navigation app.

## What is configured

- **Manifest** (generated from `frontend/vite.config.ts`): name and short name `RouteView`, description, `display: standalone`, `start_url`/`scope` `/`, theme `#0f766e`, background `#f8fafc`, icons 192, 512 and a maskable 512 (`frontend/public/icons/`, drawn from the RouteView logo; `icon.svg` is the source, no Google assets). `index.html` adds the viewport (with `viewport-fit=cover`), light/dark `theme-color`, the Apple touch icon and the web-app-capable metas.
- **Install**: the browser's own install flow is used (address-bar/menu install on Chrome and other Chromium browsers, "Add to Home Screen" on Android/iOS). There is no custom install UI. Chromium reports no installability errors for the production build.
- **Service worker** (`dist/sw.js`, registered only in production builds by `src/app/registerServiceWorker.ts`): precaches the built application shell only: HTML, JS, CSS, SVG/PNG icons and the manifest. Navigations fall back to the cached `index.html`, except `/api/*`. There is **no runtime caching**: every other request (the `/api` calls, Google Maps scripts and tiles, Places) goes to the network and is never stored. Route sessions, detected areas and search results exist only in memory.
- **Updates**: `registerType: 'prompt'` without a prompt UI. A new version installs in the background and takes over the next time the app is opened, so an update never reloads a route session in use.
- **Secrets**: nothing is added. `VITE_GOOGLE_MAPS_API_KEY` stays the only frontend Google credential; it is a build-time value that already lives in the JS bundle (so it is also part of the precached bundle, never in the manifest, service worker source, storage or `public/`). Keep it restricted by HTTP referrer and API as before.

## Offline behaviour

Offline, the installed app or a revisited tab opens its shell, shows **"You're offline. Route calculation requires an internet connection."** (`useOnlineStatus`, shown under the header) and the banner disappears when the connection returns. Maps and routing need a connection: the map shows its existing "could not be loaded" message and Find Routes reports the existing network error. The service worker stores no routes, areas, map data or API responses. The only thing kept for offline use is what the person explicitly saves with **Save for offline** (Bus stop sequences, or just places and mode), in `localStorage` and not in any service-worker cache: see [offline-journeys.md](offline-journeys.md). While offline, the notice above points to those saved journeys when there are any.

## Mobile layout (below 768px)

One scrolling page instead of a short panel above the map:

```text
Route planning:  Start / Destination / Find Routes → map → passing-area search → route results
Journey View:    route summary + switcher → map → timeline → search
```

The map is pinned to the top (`clamp(200px, 34dvh, 340px)`) while the rest scrolls beneath it, so choosing a route or a stop is always visible on the map. On touch devices and narrow screens every tappable control is at least 44 × 44 px (`src/app/touch.css`; chips keep their compact look with a larger remove hit area), the location and search fields use 16px text (no iOS focus zoom), and the header respects display cut-outs. The route switcher shares one compact row. Chips wrap; nothing causes horizontal page scrolling at 320, 360, 390, 412 or 768px.

## Commands

```bash
cd frontend
npm run build      # tsc + vite build; also generates manifest.webmanifest, sw.js and workbox-*.js in dist/
npm run preview    # serve dist/ to test installability and the offline shell (the service worker is off under `npm run dev`)
```

To test install/offline locally use `npm run preview` (http://localhost:4173); `localhost` counts as a secure context. Production must be served over HTTPS.
