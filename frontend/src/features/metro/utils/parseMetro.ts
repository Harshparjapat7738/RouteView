import { parseAccessibility } from '../../accessibility/utils/parseAccessibility.ts'
import type {
  MetroDatasetRef,
  MetroFare,
  MetroJourney,
  MetroLineRef,
  MetroNetwork,
  MetroNetworkLine,
  MetroNetworkStation,
  MetroSegment,
  MetroSegmentType,
  MetroStationRef,
  MetroStationRole,
  MetroWalkRole,
} from '../types/metro.ts'

/**
 * Parsers of backend data. Responses are untrusted input: anything malformed is dropped (an invalid station,
 * segment or journey is omitted, an invalid colour becomes null) instead of being shown or guessed.
 */

const MAX_SEGMENTS = 40
const MAX_STATIONS = 400
const MAX_TEXT = 200
const MAX_NOTICES = 5
const SEGMENT_TYPES: readonly string[] = ['WALK', 'METRO', 'TRANSFER', 'TRANSIT']
const ROLES: readonly string[] = ['BOARDING', 'INTERMEDIATE', 'INTERCHANGE', 'EXIT']
const WALK_ROLES: readonly string[] = ['FIRST_MILE', 'LAST_MILE']
const COLOR = /^#[0-9A-Fa-f]{6}$/
const CURRENCY = /^[A-Z]{3}$/
const AMOUNT = /^\d{1,9}(\.\d{1,9})?$/
const UUID = /^[0-9a-fA-F-]{36}$/

export function parseMetroJourney(value: unknown): MetroJourney | undefined {
  if (!isRecord(value) || !Array.isArray(value.segments)) {
    return undefined
  }
  const segments: MetroSegment[] = []
  for (const item of value.segments.slice(0, MAX_SEGMENTS)) {
    const segment = parseSegment(item)
    if (segment) {
      segments.push(segment)
    }
  }
  if (!segments.some((segment) => segment.type === 'METRO')) {
    return undefined
  }
  return {
    fare: parseFare(value.fare),
    transfers: nonNegativeInt(value.transfers) ?? segments.filter((segment) => segment.type === 'TRANSFER').length,
    stationCount: nonNegativeInt(value.stationCount),
    travelledStops: nonNegativeInt(value.travelledStops),
    walkingMeters: nonNegativeNumber(value.walkingMeters) ?? 0,
    walkingSeconds: nonNegativeNumber(value.walkingSeconds) ?? 0,
    departureTime: text(value.departureTime),
    arrivalTime: text(value.arrivalTime),
    stationsVerified: value.stationsVerified === true,
    segments,
    stations: parseStations(value.stations),
    dataset: parseDataset(value.dataset),
    notices: Array.isArray(value.notices)
      ? value.notices.filter((notice): notice is string => typeof notice === 'string' && notice.trim() !== '').slice(0, MAX_NOTICES).map((notice) => notice.slice(0, MAX_TEXT * 2))
      : [],
  }
}

function parseFare(value: unknown): MetroFare | null {
  if (!isRecord(value) || typeof value.currency !== 'string' || typeof value.amount !== 'string') {
    return null
  }
  return CURRENCY.test(value.currency) && AMOUNT.test(value.amount) ? { currency: value.currency, amount: value.amount } : null
}

function parseDataset(value: unknown): MetroDatasetRef | null {
  if (!isRecord(value) || typeof value.source !== 'string' || typeof value.sourceVersion !== 'string') {
    return null
  }
  return {
    source: value.source.slice(0, 64),
    sourceVersion: value.sourceVersion.slice(0, 64),
    sourceUpdatedAt: typeof value.sourceUpdatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.sourceUpdatedAt) ? value.sourceUpdatedAt : null,
    importedAt: typeof value.importedAt === 'string' ? value.importedAt.slice(0, 40) : null,
    servicePeriodStart: isoDate(value.servicePeriodStart),
    servicePeriodEnd: isoDate(value.servicePeriodEnd),
    operatingDays: Array.isArray(value.operatingDays)
      ? value.operatingDays.filter((day): day is string => typeof day === 'string' && WEEKDAYS.includes(day)).slice(0, 7)
      : [],
  }
}

function parseLine(value: unknown): MetroLineRef | null {
  if (!isRecord(value)) {
    return null
  }
  const name = text(value.name) ?? ''
  const vehicleType = text(value.vehicleType) ?? ''
  if (name === '' && vehicleType === '') {
    return null
  }
  return {
    lineId: uuid(value.lineId),
    groupId: uuid(value.groupId),
    name,
    shortName: text(value.shortName) ?? '',
    color: color(value.color),
    vehicleType,
    branch: text(value.branch),
  }
}

function parseStation(value: unknown): MetroStationRef | null {
  if (!isRecord(value)) {
    return null
  }
  const name = text(value.name)
  if (name === null || !ROLES.includes(String(value.role))) {
    return null
  }
  const latitude = coordinate(value.latitude, 90)
  const longitude = coordinate(value.longitude, 180)
  const hasPosition = latitude !== null && longitude !== null
  return {
    stationId: uuid(value.stationId),
    name,
    latitude: hasPosition ? latitude : null,
    longitude: hasPosition ? longitude : null,
    role: value.role as MetroStationRole,
    lines: Array.isArray(value.lines) ? value.lines.slice(0, 8).map(parseLine).filter((line): line is MetroLineRef => line !== null) : [],
    interchange: value.interchange === true,
    accessibility: parseAccessibility(value.accessibility),
  }
}

function parseStations(value: unknown): MetroStationRef[] {
  return Array.isArray(value) ? value.slice(0, MAX_STATIONS).map(parseStation).filter((station): station is MetroStationRef => station !== null) : []
}

function parseSegment(value: unknown): MetroSegment | null {
  if (!isRecord(value) || !SEGMENT_TYPES.includes(String(value.type))) {
    return null
  }
  const type = value.type as MetroSegmentType
  const segment: MetroSegment = {
    type,
    walkRole: WALK_ROLES.includes(String(value.walkRole)) ? (value.walkRole as MetroWalkRole) : null,
    distanceMeters: nonNegativeNumber(value.distanceMeters) ?? 0,
    durationSeconds: nonNegativeNumber(value.durationSeconds) ?? 0,
    line: parseLine(value.line),
    towards: text(value.towards),
    boarding: parseStation(value.boarding),
    exit: parseStation(value.exit),
    stopCount: nonNegativeInt(value.stopCount) ?? 0,
    intermediateStations: Array.isArray(value.intermediateStations) ? parseStations(value.intermediateStations) : null,
    departureTime: text(value.departureTime),
    arrivalTime: text(value.arrivalTime),
    transferStation: parseStation(value.transferStation),
    transferToStation: parseStation(value.transferToStation),
    fromLine: parseLine(value.fromLine),
    toLine: parseLine(value.toLine),
    transferWalkMeters: nonNegativeNumber(value.transferWalkMeters),
    transferWalkSeconds: nonNegativeNumber(value.transferWalkSeconds),
  }
  // A ride without both ends, or a transfer without its station, cannot be shown honestly.
  if ((type === 'METRO' || type === 'TRANSIT') && (segment.boarding === null || segment.exit === null)) {
    return null
  }
  if (type === 'TRANSFER' && segment.transferStation === null) {
    return null
  }
  return segment
}

export function parseMetroNetwork(value: unknown): MetroNetwork | null {
  if (!isRecord(value) || !Array.isArray(value.stations) || !Array.isArray(value.lines)) {
    return null
  }
  const stations: MetroNetworkStation[] = []
  for (const item of value.stations.slice(0, 2000)) {
    if (!isRecord(item)) continue
    const id = uuid(item.id)
    const name = text(item.name)
    const latitude = coordinate(item.latitude, 90)
    const longitude = coordinate(item.longitude, 180)
    if (id === null || name === null || latitude === null || longitude === null) continue
    stations.push({
      id,
      name,
      latitude,
      longitude,
      lineIds: Array.isArray(item.lineIds) ? item.lineIds.map(uuid).filter((lineId): lineId is string => lineId !== null) : [],
      groupIds: Array.isArray(item.groupIds) ? item.groupIds.map(uuid).filter((groupId): groupId is string => groupId !== null) : [],
      interchange: item.interchange === true,
    })
  }
  const known = new Set(stations.map((station) => station.id))
  const lines: MetroNetworkLine[] = []
  for (const item of value.lines.slice(0, 100)) {
    if (!isRecord(item)) continue
    const id = uuid(item.id)
    const name = text(item.name)
    if (id === null || name === null) continue
    const patterns = Array.isArray(item.patterns)
      ? item.patterns.slice(0, 40).flatMap((pattern) => {
          if (!isRecord(pattern) || !Array.isArray(pattern.stationIds)) return []
          const stationIds = pattern.stationIds.slice(0, 500).map(uuid).filter((stationId): stationId is string => stationId !== null && known.has(stationId))
          return stationIds.length >= 2 ? [{ pattern: text(pattern.pattern) ?? '', toward: text(pattern.toward), stationIds }] : []
        })
      : []
    lines.push({
      id,
      name,
      shortName: text(item.shortName) ?? '',
      color: color(item.color),
      groupId: uuid(item.groupId),
      groupName: text(item.groupName),
      branch: text(item.branch),
      patterns,
      shapes: parseShapes(item.shapes),
    })
  }
  return { dataset: parseDataset(value.dataset), geometry: value.geometry === 'GTFS_SHAPES' ? 'GTFS_SHAPES' : 'STATION_SEQUENCE', stations, lines }
}

const WEEKDAYS: readonly string[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const MAX_SHAPES = 40
const MAX_SHAPE_POINTS = 4000

/** Shapes arrive as [[lat, lng], ...]; a point outside the valid range is dropped and a path needs two points. */
function parseShapes(value: unknown): { lat: number; lng: number }[][] {
  if (!Array.isArray(value)) return []
  const paths: { lat: number; lng: number }[][] = []
  for (const shape of value.slice(0, MAX_SHAPES)) {
    if (!isRecord(shape) || !Array.isArray(shape.points)) continue
    const path: { lat: number; lng: number }[] = []
    for (const point of shape.points.slice(0, MAX_SHAPE_POINTS)) {
      if (!Array.isArray(point) || point.length < 2) continue
      const lat = coordinate(point[0], 90)
      const lng = coordinate(point[1], 180)
      if (lat !== null && lng !== null) path.push({ lat, lng })
    }
    if (path.length >= 2) paths.push(path)
  }
  return paths
}

function isoDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

// ---- small validators

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, MAX_TEXT) : null
}

function color(value: unknown): string | null {
  return typeof value === 'string' && COLOR.test(value) ? value.toUpperCase() : null
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function nonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function coordinate(value: unknown, limit: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null
}
