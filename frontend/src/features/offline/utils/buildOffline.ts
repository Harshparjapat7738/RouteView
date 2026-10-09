import type { BusJourney, BusSegment } from '../../bus/types/bus.ts'
import { formatBusClock } from '../../bus/utils/busFormat.ts'
import type { LocationSelection } from '../../location/types/location.ts'
import type { TravelPreferences } from '../../preferences/types/preferences.ts'
import type { Route } from '../../route/types/route.ts'
import type { TravelMode } from '../../route/types/travelMode.ts'
import { cleanLabel } from '../../places/utils/placesData.ts'
import {
  CURRENT_LOCATION_ORIGIN,
  type OfflineEndpoint,
  type OfflineIntentReason,
  type OfflineItinerary,
  type OfflineJourney,
  type OfflineStep,
} from '../types/offline.ts'
import { DEFAULT_OFFLINE_POLICY, itineraryAllowed, type OfflinePolicy } from './offlinePolicy.ts'

export type BuildError = 'NO_PLACE_ID' | 'NO_DESTINATION'
export type BuildResult = { ok: true; journey: OfflineJourney } | { ok: false; error: BuildError }

export const BUILD_ERROR_MESSAGES: Readonly<Record<BuildError, string>> = {
  NO_PLACE_ID: 'This journey cannot be kept offline: one of its places has no stored identity to look up again.',
  NO_DESTINATION: 'There is no journey to save yet.',
}

export interface BuildInput {
  start: LocationSelection | null
  destination: LocationSelection | null
  travelMode: TravelMode
  route: Route | null
  preferences: TravelPreferences
  id: string
  now: number
  policy?: OfflinePolicy
}

function endpoint(location: LocationSelection): OfflineEndpoint | null {
  return location.placeId ? { placeId: location.placeId, label: cleanLabel(location.name, 80) } : null
}

function minutesOf(seconds: number): number | null {
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds / 60) : null
}

function walkStep(segment: BusSegment): OfflineStep | null {
  if (segment.walkRole === null) return null
  return { type: 'WALK', role: segment.walkRole, minutes: minutesOf(segment.durationSeconds) }
}

function rideStep(segment: BusSegment): OfflineStep | null {
  if (segment.route === null || segment.stops.length < 2) return null
  return {
    type: 'BUS',
    route: segment.route.name,
    agency: segment.route.agency,
    headsign: segment.headsign,
    stops: segment.stops.map((stop) => stop.name),
    departure: formatBusClock(segment.departureTime) || null,
    arrival: formatBusClock(segment.arrivalTime) || null,
  }
}

function transferStep(segment: BusSegment): OfflineStep | null {
  if (segment.transferStop === null) return null
  return {
    type: 'TRANSFER',
    stop: segment.transferStop.name,
    fromRoute: segment.fromRoute?.name ?? null,
    toRoute: segment.toRoute?.name ?? null,
    waitMinutes: minutesOf(segment.waitSeconds),
  }
}

/**
 * The compact itinerary of a Bus journey: route numbers, stop names in riding order and transfers, nothing else. No
 * coordinates, shapes or paths (so nothing could be drawn as a route), no fare, no accessibility claim. When the journey
 * starts at the current location the first walk is left out: it describes the device's position, which is not kept.
 * Null when the journey has no complete ride to show.
 */
export function busItinerary(bus: BusJourney, startsAtCurrentLocation: boolean): OfflineItinerary | null {
  const steps: OfflineStep[] = []
  for (const segment of bus.segments) {
    if (segment.type === 'WALK' && startsAtCurrentLocation && segment.walkRole === 'FIRST_MILE') continue
    const step = segment.type === 'WALK' ? walkStep(segment) : segment.type === 'BUS' ? rideStep(segment) : transferStep(segment)
    // An incomplete ride would be a wrong itinerary: the whole itinerary is refused instead of being patched together.
    if (step === null) {
      if (segment.type === 'BUS') return null
      continue
    }
    steps.push(step)
  }
  if (!steps.some((step) => step.type === 'BUS')) return null
  const info = bus.datasetInfo ?? null
  return {
    source: info?.source ?? null,
    datasetVersion: bus.datasetVersion,
    servicePeriodEnd: info?.servicePeriodEnd ?? null,
    datasetImportedAt: info?.importedAt ?? null,
    transfers: bus.transfers,
    steps,
  }
}

/**
 * What saving a journey for offline use keeps. The caller has already decided to save; this decides how much may be kept:
 * a Bus journey from RouteView's own planner keeps its itinerary (policy permitting), every other journey keeps only its
 * intent. The device position is never kept: a current-location start is stored as the word, not a coordinate.
 */
export function buildOfflineJourney(input: BuildInput): BuildResult {
  const { start, destination, travelMode, route, preferences, id, now } = input
  if (destination === null || start === null) return { ok: false, error: 'NO_DESTINATION' }
  const to = endpoint(destination)
  const current = start.origin === 'CURRENT_LOCATION'
  const from = current ? CURRENT_LOCATION_ORIGIN : endpoint(start)
  if (to === null || from === null) return { ok: false, error: 'NO_PLACE_ID' }
  const policy = input.policy ?? DEFAULT_OFFLINE_POLICY

  let itinerary: OfflineItinerary | null = null
  let intentReason: OfflineIntentReason | null = 'GOOGLE_CONTENT'
  if (travelMode === 'BUS') {
    if (!itineraryAllowed(travelMode, policy)) {
      intentReason = 'DATA_TERMS'
    } else {
      itinerary = route?.bus !== undefined ? busItinerary(route.bus, current) : null
      intentReason = itinerary === null ? 'NO_ITINERARY' : null
    }
  }
  return { ok: true, journey: { id, savedAt: now, travelMode, origin: from, destination: to, preferences, itinerary, intentReason } }
}
