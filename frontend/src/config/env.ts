/**
 * Single place where browser-visible environment configuration is read.
 * Everything here is public (shipped in the JavaScript bundle): never add secrets.
 * The Google Maps key is a browser key and must be restricted in Google Cloud
 * (see docs/google-cloud-setup.md).
 */
const DEFAULT_API_BASE_URL = '/api'

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

const googleMapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim()

export const env = Object.freeze({
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL),
  googleMapsApiKey,
  isGoogleMapsConfigured: googleMapsApiKey.length > 0,
  map: Object.freeze({
    mapId: (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim(),
    defaultLat: import.meta.env.VITE_MAP_DEFAULT_LAT,
    defaultLng: import.meta.env.VITE_MAP_DEFAULT_LNG,
    defaultZoom: import.meta.env.VITE_MAP_DEFAULT_ZOOM,
  }),
})
