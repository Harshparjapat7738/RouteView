import { cleanLabel, isPlaceId } from '../../places/utils/placesData.ts'
import { DEFAULT_PREFERENCES, type TravelPreferences } from '../../preferences/types/preferences.ts'
import { parsePreferences, serializePreferences } from '../../preferences/utils/preferencesData.ts'
import { isTravelMode } from '../../route/types/travelMode.ts'
import {
  CURRENT_LOCATION_ORIGIN,
  OFFLINE_SCHEMA_VERSION,
  type OfflineBusRide,
  type OfflineBusTransfer,
  type OfflineBusWalk,
  type OfflineData,
  type OfflineEndpoint,
  type OfflineIntentReason,
  type OfflineItinerary,
  type OfflineJourney,
  type OfflineStep,
} from '../types/offline.ts'
import { MAX_OFFLINE_JOURNEYS, MAX_STORED_CHARS, OFFLINE_LABEL_TTL_MS } from './offlinePolicy.ts'

export const OFFLINE_STORAGE_KEY = 'routeview.offlineJourneys'
export const EMPTY_OFFLINE: OfflineData = Object.freeze({ journeys: Object.freeze([]) as readonly OfflineJourney[] }) as OfflineData

const MAX_LABEL = 80
const MAX_NAME = 120
const MAX_STEPS = 24
const MAX_STOPS_PER_RIDE = 200
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000
const DAY = /^\d{4}-\d{2}-\d{2}$/
const INSTANT = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/
const CLOCK = /^\d{2}:\d{2}$/
const REASONS: readonly OfflineIntentReason[] = ['GOOGLE_CONTENT', 'DATA_TERMS', 'NO_ITINERARY']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const name = (value: unknown): string | null => cleanLabel(value, MAX_NAME)
const optionalName = (value: unknown): string | null => (value === null || value === undefined ? null : name(value))
const minutes = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100_000 ? value : null)
const day = (value: unknown): string | null => (typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(value)) ? value : null)
const instant = (value: unknown): string | null => (typeof value === 'string' && INSTANT.test(value) && !Number.isNaN(Date.parse(value)) ? value : null)
const clock = (value: unknown): string | null => (typeof value === 'string' && CLOCK.test(value) ? value : null)

/** The identity of a journey: the same two places and mode are one saved journey (saving again replaces it). */
export function journeyKey(journey: Pick<OfflineJourney, 'origin' | 'destination' | 'travelMode'>): string {
  const origin = journey.origin === CURRENT_LOCATION_ORIGIN ? CURRENT_LOCATION_ORIGIN : journey.origin.placeId
  return `${origin}>${journey.destination.placeId}@${journey.travelMode}`
}

// ---- reading

function parseEndpoint(value: unknown): OfflineEndpoint | null {
  if (!isRecord(value) || !isPlaceId(value.placeId)) return null
  return { placeId: value.placeId, label: value.label === null ? null : cleanLabel(value.label, MAX_LABEL) }
}

function parseStep(value: unknown): OfflineStep | null {
  if (!isRecord(value)) return null
  if (value.type === 'WALK') {
    if (value.role !== 'FIRST_MILE' && value.role !== 'LAST_MILE') return null
    const walk: OfflineBusWalk = { type: 'WALK', role: value.role, minutes: minutes(value.minutes) }
    return walk
  }
  if (value.type === 'BUS') {
    const route = name(value.route)
    if (route === null || !Array.isArray(value.stops)) return null
    const stops = value.stops.slice(0, MAX_STOPS_PER_RIDE).map(name)
    // A ride needs its boarding and exit stops; a ride with an unreadable stop is dropped whole, never half-shown.
    if (stops.length < 2 || stops.some((stop) => stop === null)) return null
    const ride: OfflineBusRide = {
      type: 'BUS',
      route,
      agency: optionalName(value.agency),
      headsign: optionalName(value.headsign),
      stops: stops as string[],
      departure: clock(value.departure),
      arrival: clock(value.arrival),
    }
    return ride
  }
  if (value.type === 'TRANSFER') {
    const stop = name(value.stop)
    if (stop === null) return null
    const transfer: OfflineBusTransfer = {
      type: 'TRANSFER',
      stop,
      fromRoute: optionalName(value.fromRoute),
      toRoute: optionalName(value.toRoute),
      waitMinutes: minutes(value.waitMinutes),
    }
    return transfer
  }
  return null
}

function parseItinerary(value: unknown): OfflineItinerary | null {
  if (!isRecord(value) || !Array.isArray(value.steps) || value.steps.length > MAX_STEPS) return null
  const steps = value.steps.map(parseStep)
  // One unreadable step makes the whole itinerary untrustworthy: it is dropped and the journey falls back to intent only.
  if (steps.some((step) => step === null) || !steps.some((step) => step?.type === 'BUS')) return null
  return {
    source: optionalName(value.source),
    datasetVersion: optionalName(value.datasetVersion),
    servicePeriodEnd: day(value.servicePeriodEnd),
    datasetImportedAt: instant(value.datasetImportedAt),
    transfers: minutes(value.transfers) ?? 0,
    steps: steps as OfflineStep[],
  }
}

function parsePreferenceSnapshot(value: unknown): TravelPreferences {
  if (!isRecord(value)) return DEFAULT_PREFERENCES
  return parsePreferences(JSON.stringify(value)).preferences
}

function parseJourney(value: unknown, now: number): OfflineJourney | null {
  if (!isRecord(value)) return null
  const { id, travelMode } = value
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null
  if (typeof travelMode !== 'string' || !isTravelMode(travelMode)) return null
  const origin = value.origin === CURRENT_LOCATION_ORIGIN ? CURRENT_LOCATION_ORIGIN : parseEndpoint(value.origin)
  const destination = parseEndpoint(value.destination)
  const savedAt = value.savedAt
  if (origin === null || destination === null) return null
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt <= 0 || savedAt > now + FUTURE_TOLERANCE_MS) return null
  const itinerary = value.itinerary === null || value.itinerary === undefined ? null : parseItinerary(value.itinerary)
  // An itinerary that could not be read leaves the intent behind, saying so.
  const reason = itinerary !== null ? null : REASONS.find((candidate) => candidate === value.intentReason) ?? (value.itinerary ? 'NO_ITINERARY' : 'GOOGLE_CONTENT')
  return { id, savedAt, travelMode, origin, destination, preferences: parsePreferenceSnapshot(value.preferences), itinerary, intentReason: reason }
}

/** Google display names are kept at most 30 days: afterwards the place is shown without a name. */
function expireLabels(journey: OfflineJourney, now: number): OfflineJourney {
  if (now - journey.savedAt <= OFFLINE_LABEL_TTL_MS) return journey
  const origin = journey.origin === CURRENT_LOCATION_ORIGIN ? journey.origin : { ...journey.origin, label: null }
  return { ...journey, origin, destination: { ...journey.destination, label: null } }
}

/** Newest first, one per journey key, capped; expired labels removed. */
export function normalizeOffline(data: OfflineData, now: number): OfflineData {
  const seen = new Set<string>()
  const journeys = [...data.journeys]
    .sort((a, b) => b.savedAt - a.savedAt)
    .filter((journey) => {
      const key = journeyKey(journey)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_OFFLINE_JOURNEYS)
    .map((journey) => expireLabels(journey, now))
  return { journeys }
}

export type OfflineParse = { data: OfflineData; status: 'empty' | 'ok' | 'discarded'; dropped: number }

/**
 * Reads stored text. Not JSON, a wrong shape or another schema version gives an empty result with `discarded` (so the caller
 * can remove it); single unreadable records are dropped without losing the rest, and `dropped` counts them.
 */
export function parseOffline(raw: string | null, now: number): OfflineParse {
  if (raw === null) return { data: EMPTY_OFFLINE, status: 'empty', dropped: 0 }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { data: EMPTY_OFFLINE, status: 'discarded', dropped: 0 }
  }
  if (!isRecord(parsed) || parsed.version !== OFFLINE_SCHEMA_VERSION || !Array.isArray(parsed.journeys)) {
    return { data: EMPTY_OFFLINE, status: 'discarded', dropped: 0 }
  }
  const journeys = parsed.journeys.map((value) => parseJourney(value, now)).filter((value): value is OfflineJourney => value !== null)
  return { data: normalizeOffline({ journeys }, now), status: 'ok', dropped: parsed.journeys.length - journeys.length }
}

// ---- writing

export function serializeOffline(data: OfflineData): string {
  return JSON.stringify({
    version: OFFLINE_SCHEMA_VERSION,
    journeys: data.journeys.map((journey) => ({ ...journey, preferences: JSON.parse(serializePreferences(journey.preferences)) as unknown })),
  })
}

export type OfflineChangeError = 'LIMIT' | 'TOO_LARGE' | 'NOT_FOUND'
export type OfflineChange = { ok: true; data: OfflineData } | { ok: false; error: OfflineChangeError }

export const OFFLINE_CHANGE_MESSAGES: Readonly<Record<OfflineChangeError, string>> = {
  LIMIT: `You can keep up to ${MAX_OFFLINE_JOURNEYS} journeys offline. Remove one to save another.`,
  TOO_LARGE: 'This journey is too large to keep offline.',
  NOT_FOUND: 'That saved journey is no longer there.',
}

/** Adds or replaces (same places and mode) a journey. Does not change the stored data when it cannot. */
export function addOfflineJourney(data: OfflineData, journey: OfflineJourney, now: number): OfflineChange {
  const key = journeyKey(journey)
  const others = data.journeys.filter((existing) => journeyKey(existing) !== key)
  if (others.length >= MAX_OFFLINE_JOURNEYS) return { ok: false, error: 'LIMIT' }
  const next = normalizeOffline({ journeys: [journey, ...others] }, now)
  if (serializeOffline(next).length > MAX_STORED_CHARS) return { ok: false, error: 'TOO_LARGE' }
  return { ok: true, data: next }
}

export function removeOfflineJourney(data: OfflineData, id: string): OfflineChange {
  if (!data.journeys.some((journey) => journey.id === id)) return { ok: false, error: 'NOT_FOUND' }
  return { ok: true, data: { journeys: data.journeys.filter((journey) => journey.id !== id) } }
}

export function clearOfflineJourneys(): OfflineData {
  return EMPTY_OFFLINE
}

export function findSaved(data: OfflineData, probe: Pick<OfflineJourney, 'origin' | 'destination' | 'travelMode'>): OfflineJourney | null {
  const key = journeyKey(probe)
  return data.journeys.find((journey) => journeyKey(journey) === key) ?? null
}
