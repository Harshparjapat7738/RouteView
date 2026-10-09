import { parseAccessibility } from '../../accessibility/utils/parseAccessibility.ts'
import type { LatLng } from '../../../types/geo.ts'
import { decodePolyline } from '../../route/utils/polyline.ts'
import type {
  BusDatasetInfo,
  BusJourney,
  BusNoRouteReason,
  BusRouteRef,
  BusSegment,
  BusSegmentType,
  BusStop,
  BusStopRole,
  BusWalkRole,
} from '../types/bus.ts'

/**
 * Backend data is untrusted. A malformed stop, geometry or notice is dropped; a malformed journey is dropped as a whole.
 * Nothing is repaired or guessed: a ride without its route, boarding or exit stop is not a ride we can show.
 */

const MAX_SEGMENTS = 24
const MAX_STOPS_PER_SEGMENT = 500
const MAX_JOURNEY_STOPS = 1000
const MAX_TEXT = 200
const MAX_NOTICES = 8
const CURRENCY = /^[A-Z]{3}$/
const AMOUNT = /^\d{1,9}(\.\d{1,9})?$/
const SEGMENT_TYPES: readonly string[] = ['WALK', 'BUS', 'TRANSFER']
const STOP_ROLES: readonly string[] = ['BOARDING', 'INTERMEDIATE', 'TRANSFER', 'EXIT']
const WALK_ROLES: readonly string[] = ['FIRST_MILE', 'LAST_MILE']
const NO_ROUTE_REASONS: readonly string[] = ['NO_BUS_DATA', 'NO_STOP_NEAR_START', 'NO_STOP_NEAR_DESTINATION', 'NO_SERVICE', 'NO_JOURNEY']
const GEOMETRY_SOURCES = ['GTFS_SHAPES', 'STOP_SEQUENCE', 'MIXED'] as const

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 10_000_000 ? value : null)
const amount = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e9 ? value : null)
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, MAX_TEXT) : null)

export function parseNoRouteReason(value: unknown): BusNoRouteReason | null {
  return typeof value === 'string' && NO_ROUTE_REASONS.includes(value) ? (value as BusNoRouteReason) : null
}

function parseStop(value: unknown): BusStop | null {
  if (!isRecord(value)) return null
  const key = text(value.stopId)
  const name = text(value.name)
  const { latitude, longitude, role } = value
  if (
    key === null ||
    name === null ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    typeof role !== 'string' ||
    !STOP_ROLES.includes(role)
  ) {
    return null
  }
  return { key, name, latitude, longitude, role: role as BusStopRole, accessibility: parseAccessibility(value.accessibility) }
}

function parseStops(value: unknown, max: number): BusStop[] {
  if (!Array.isArray(value)) return []
  const stops: BusStop[] = []
  for (const item of value.slice(0, max)) {
    const stop = parseStop(item)
    if (stop !== null) stops.push(stop)
  }
  return stops
}

function parseRoute(value: unknown): BusRouteRef | null {
  if (!isRecord(value)) return null
  const name = text(value.name) ?? text(value.shortName) ?? text(value.longName)
  return name === null ? null : { name, agency: text(value.agency) }
}

function parsePath(value: unknown): LatLng[] {
  if (typeof value !== 'string' || value === '') return []
  try {
    return decodePolyline(value)
  } catch {
    return [] // a bad geometry is left out; the rest of the journey is still usable
  }
}

function parseSegment(value: unknown): BusSegment | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !SEGMENT_TYPES.includes(value.type)) return null
  const type = value.type as BusSegmentType
  const distanceMeters = amount(value.distanceMeters)
  const durationSeconds = amount(value.durationSeconds)
  const listedStopCount = count(value.listedStopCount) ?? 0
  const stopToStopSegments = count(value.stopToStopSegments) ?? 0
  const waitSeconds = amount(value.waitSeconds) ?? 0
  if (distanceMeters === null || durationSeconds === null) return null

  const route = parseRoute(value.route)
  const boarding = parseStop(value.boarding)
  const exit = parseStop(value.exit)
  const stops = parseStops(value.stops, MAX_STOPS_PER_SEGMENT)
  if (type === 'BUS' && (route === null || boarding === null || exit === null || stops.length < 2)) return null

  const walkRole = typeof value.walkRole === 'string' && WALK_ROLES.includes(value.walkRole) ? (value.walkRole as BusWalkRole) : null
  return {
    type,
    walkRole,
    distanceMeters,
    durationSeconds,
    route,
    headsign: text(value.headsign),
    headsignIsTerminal: value.headsignSource === 'TERMINAL_STOP',
    boarding,
    exit,
    stops,
    listedStopCount,
    stopToStopSegments,
    departureTime: text(value.departureTime),
    arrivalTime: text(value.arrivalTime),
    waitSeconds,
    transferStop: parseStop(value.transferStop),
    fromRoute: parseRoute(value.fromRoute),
    toRoute: parseRoute(value.toRoute),
    path: parsePath(value.geometry),
    estimated: value.estimated === true,
  }
}

export function parseBusJourney(value: unknown): BusJourney | undefined {
  if (!isRecord(value) || !Array.isArray(value.segments) || value.segments.length > MAX_SEGMENTS) return undefined
  const transfers = count(value.transfers)
  const listedStopCount = count(value.listedStopCount)
  const walkingSeconds = amount(value.walkingSeconds)
  if (transfers === null || listedStopCount === null || walkingSeconds === null) return undefined

  const segments: BusSegment[] = []
  for (const item of value.segments) {
    const segment = parseSegment(item)
    if (segment === null) return undefined // a journey with a broken part is not shown as a complete one
    segments.push(segment)
  }
  const rides = segments.filter((segment) => segment.type === 'BUS')
  if (rides.length === 0) return undefined

  const fare =
    isRecord(value.fare) &&
    typeof value.fare.currency === 'string' &&
    CURRENCY.test(value.fare.currency) &&
    typeof value.fare.amount === 'string' &&
    AMOUNT.test(value.fare.amount)
      ? { currency: value.fare.currency, amount: value.fare.amount }
      : null
  const dataset = isRecord(value.dataset) ? text(value.dataset.sourceVersion) : null
  const datasetInfo = isRecord(value.dataset) ? parseDatasetInfo(value.dataset) : null
  const notices = Array.isArray(value.notices) ? value.notices.map(text).filter((notice): notice is string => notice !== null).slice(0, MAX_NOTICES) : []
  const geometry = GEOMETRY_SOURCES.find((source) => source === value.geometrySource) ?? null
  return {
    transfers,
    busLegCount: count(value.busLegCount) ?? rides.length,
    listedStopCount,
    walkingMeters: amount(value.walkingMeters) ?? 0,
    walkingSeconds,
    rideSeconds: amount(value.rideSeconds) ?? 0,
    waitSeconds: amount(value.waitSeconds) ?? 0,
    segments,
    stops: parseStops(value.stops, MAX_JOURNEY_STOPS),
    fare,
    timetableBasis: 'STATIC_SCHEDULE',
    geometrySource: geometry,
    departureTime: text(value.departureTime),
    arrivalTime: text(value.arrivalTime),
    notices,
    datasetVersion: dataset,
    datasetInfo,
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const INSTANT = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/
const isoDay = (value: unknown): string | null => (typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(value)) ? value : null)

function parseDatasetInfo(value: Record<string, unknown>): BusDatasetInfo {
  return {
    source: text(value.source),
    sourceVersion: text(value.sourceVersion),
    importedAt: typeof value.importedAt === 'string' && INSTANT.test(value.importedAt) && !Number.isNaN(Date.parse(value.importedAt)) ? value.importedAt : null,
    servicePeriodStart: isoDay(value.servicePeriodStart),
    servicePeriodEnd: isoDay(value.servicePeriodEnd),
  }
}
