import { registerSW } from 'virtual:pwa-register'

/**
 * Registers the service worker that caches the application shell. Production builds only: in development a
 * service worker would serve stale files. A new version is installed in the background and takes over the next
 * time RouteView is opened, so an update never interrupts a route session.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    registerSW({ immediate: true })
  }
}
