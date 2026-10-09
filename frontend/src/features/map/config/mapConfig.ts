import type { MapProps } from '@vis.gl/react-google-maps'
import { env } from '../../../config/env.ts'

/** Neutral overview of India. No user location is used. */
const FALLBACK_CENTER = { lat: 22.5937, lng: 78.9629 }
const FALLBACK_ZOOM = 5

/** Google's documented ID for development; set VITE_GOOGLE_MAPS_MAP_ID with your own Map ID for production. */
const DEVELOPMENT_MAP_ID = 'DEMO_MAP_ID'

const MIN_ZOOM = 1
const MAX_ZOOM = 20

function parseNumberInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

/** Every map-related setting lives here; components must not define their own. */
export const mapConfig = Object.freeze({
  apiKey: env.googleMapsApiKey,
  // Advanced markers require a map ID.
  mapId: env.map.mapId || DEVELOPMENT_MAP_ID,
  defaultCenter: {
    lat: parseNumberInRange(env.map.defaultLat, FALLBACK_CENTER.lat, -90, 90),
    lng: parseNumberInRange(env.map.defaultLng, FALLBACK_CENTER.lng, -180, 180),
  },
  defaultZoom: parseNumberInRange(env.map.defaultZoom, FALLBACK_ZOOM, MIN_ZOOM, MAX_ZOOM),
  selectedLocationZoom: 13,
  /** A highlighted area is brought into view at least this close. */
  areaHighlightMinZoom: 12,
  markerStyles: {
    start: { background: '#0f766e', borderColor: '#115e59', glyph: 'A' },
    destination: { background: '#c5221f', borderColor: '#a50e0e', glyph: 'B' },
  },
  options: {
    gestureHandling: 'greedy',
    // RouteView shows geographical areas only: base-map POI icons are not clickable.
    clickableIcons: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  } satisfies Partial<MapProps>,
})
