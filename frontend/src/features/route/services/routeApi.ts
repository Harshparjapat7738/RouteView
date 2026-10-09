import { apiRequest } from '../../../services/api/httpClient.ts'
import type { LocationSelection } from '../../location/types/location.ts'
import { AREA_TYPES, type AreaType, type DetectedArea } from '../types/detectedArea.ts'
import type { Route } from '../types/route.ts'
import type { BusNoRouteReason } from '../../bus/types/bus.ts'
import { parseBusJourney, parseNoRouteReason } from '../../bus/utils/parseBus.ts'
import { parseMetroJourney } from '../../metro/utils/parseMetro.ts'
import { parseTransit } from '../utils/parseTransit.ts'
import type { TravelMode } from '../types/travelMode.ts'
import { decodePolyline } from '../utils/polyline.ts'

const MAX_ROUTES = 10
const MAX_ID_LENGTH = 100
const MAX_SUMMARY_LENGTH = 200
const MIN_PATH_POINTS = 2
const MAX_DETECTED_AREAS = 200
const MAX_AREA_NAME_LENGTH = 255
const MAX_WARNING_LENGTH = 200
const MAX_WARNINGS = 5

/** The backend answered successfully but not in the documented format. */
export class RouteResponseError extends Error {
  constructor() {
    super('Unexpected route response')
    this.name = 'RouteResponseError'
  }
}

/** Asks the backend for route alternatives between two selected locations. */
export async function fetchRoutes(
  start: LocationSelection,
  destination: LocationSelection,
  travelMode: TravelMode,
  signal: AbortSignal,
): Promise<Route[]> {
  return (await fetchRouteResult(start, destination, travelMode, signal)).routes
}

/** The routes of a request and, for Bus only, why there are none (a stable code from the bus engine). */
export interface RouteResult {
  routes: Route[]
  noRouteReason: BusNoRouteReason | null
}

export async function fetchRouteResult(
  start: LocationSelection,
  destination: LocationSelection,
  travelMode: TravelMode,
  signal: AbortSignal,
): Promise<RouteResult> {
  // Bus journeys are planned by RouteView's own bus engine; its endpoint also says why a journey is missing.
  const response = await apiRequest<unknown>(travelMode === 'BUS' ? '/bus/journey' : '/routes', {
    method: 'POST',
    body: {
      origin: { latitude: start.latitude, longitude: start.longitude },
      destination: { latitude: destination.latitude, longitude: destination.longitude },
      travelMode,
    },
    signal,
  })
  const routes = parseRoutes(response)
  const reason = isRecord(response) ? parseNoRouteReason(response.emptyReason) : null
  return { routes, noRouteReason: routes.length === 0 && travelMode === 'BUS' ? (reason ?? 'NO_JOURNEY') : null }
}

// The response is untrusted input: everything is checked before use.
function parseRoutes(response: unknown): Route[] {
  if (!isRecord(response) || !Array.isArray(response.routes) || response.routes.length > MAX_ROUTES) {
    throw new RouteResponseError()
  }
  return response.routes.map(parseRoute).sort((a, b) => a.index - b.index)
}

function parseRoute(value: unknown): Route {
  if (!isRecord(value)) {
    throw new RouteResponseError()
  }
  const { id, index, distanceMeters, durationSeconds, summary, encodedPolyline } = value
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > MAX_ID_LENGTH ||
    !isNonNegativeNumber(index) ||
    !isNonNegativeNumber(distanceMeters) ||
    !isNonNegativeNumber(durationSeconds) ||
    typeof encodedPolyline !== 'string'
  ) {
    throw new RouteResponseError()
  }

  let path: Route['path']
  try {
    path = decodePolyline(encodedPolyline)
  } catch {
    throw new RouteResponseError()
  }
  if (path.length < MIN_PATH_POINTS) {
    throw new RouteResponseError()
  }

  return {
    id,
    index,
    distanceMeters,
    durationSeconds,
    summary: typeof summary === 'string' ? summary.slice(0, MAX_SUMMARY_LENGTH) : '',
    encodedPolyline,
    path,
    detectedAreas: parseDetectedAreas(value.detectedAreas),
    transit: parseTransit(value.transit),
    warnings: parseWarnings(value.warnings),
    metro: parseMetroJourney(value.metro),
    bus: parseBusJourney(value.bus),
  }
}

function parseWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').slice(0, MAX_WARNINGS).map((item) => item.slice(0, MAX_WARNING_LENGTH))
}

/**
 * Detected areas are an enhancement of a route: a missing or malformed list (or entry) never makes the
 * route itself unusable, it only means those areas are not shown.
 */
function parseDetectedAreas(value: unknown): DetectedArea[] {
  if (!Array.isArray(value)) {
    return []
  }
  const areas: DetectedArea[] = []
  for (const item of value.slice(0, MAX_DETECTED_AREAS)) {
    const area = parseDetectedArea(item)
    if (area) {
      areas.push(area)
    }
  }
  return areas.sort((a, b) => a.sequence - b.sequence)
}

function parseDetectedArea(value: unknown): DetectedArea | null {
  if (!isRecord(value)) {
    return null
  }
  const { areaId, name, areaType, sequence, positionAlongRoute, distanceFromStartMeters, latitude, longitude } = value
  if (
    typeof areaId !== 'string' ||
    areaId.length === 0 ||
    areaId.length > MAX_ID_LENGTH ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    !isAreaType(areaType) ||
    typeof sequence !== 'number' ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    typeof positionAlongRoute !== 'number' ||
    !Number.isFinite(positionAlongRoute) ||
    positionAlongRoute < 0 ||
    positionAlongRoute > 1 ||
    !isNonNegativeNumber(distanceFromStartMeters) ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null
  }
  return {
    areaId,
    name: name.trim().slice(0, MAX_AREA_NAME_LENGTH),
    areaType,
    sequence,
    positionAlongRoute,
    distanceFromStartMeters,
    location: { lat: latitude, lng: longitude },
  }
}

function isAreaType(value: unknown): value is AreaType {
  return typeof value === 'string' && (AREA_TYPES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
