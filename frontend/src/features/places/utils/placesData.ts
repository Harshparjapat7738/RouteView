import { isTravelMode } from '../../route/types/travelMode.ts'
import {
  CURRENT_LOCATION,
  type JourneyEndpoint,
  type PlacesData,
  type RecentJourney,
  type SavedPlace,
  type SavedPlaceKind,
} from '../types/places.ts'

/** The only schema version. A document with another version is ignored (never half-read), see `parsePlaces`. */
export const SCHEMA_VERSION = 1
export const STORAGE_KEY = 'routeview.places'
export const MAX_SAVED_PLACES = 20
export const MAX_RECENT_JOURNEYS = 10
/** Recent journeys are a short-lived convenience: they leave the browser after this long (the Maps 30-day cache window). */
export const RECENT_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_LABEL_LENGTH = 40
const MAX_ENDPOINT_LABEL_LENGTH = 80
const MAX_PLACE_ID_LENGTH = 512
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000

export const EMPTY_PLACES: PlacesData = Object.freeze({ saved: [], recent: [] }) as PlacesData

const RESERVED_LABELS: ReadonlySet<string> = new Set(['home', 'work'])
const PLACE_ID = /^[A-Za-z0-9_-]+$/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g

export function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const label = value.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim()
  return label.length >= 1 && label.length <= max ? label : null
}

export function isPlaceId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_PLACE_ID_LENGTH && PLACE_ID.test(value)
}

function validTime(value: unknown, now: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now + FUTURE_TOLERANCE_MS ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEndpoint(value: unknown): JourneyEndpoint | null {
  if (!isRecord(value) || !isPlaceId(value.placeId)) return null
  const label = cleanLabel(value.label, MAX_ENDPOINT_LABEL_LENGTH)
  return label === null ? null : { placeId: value.placeId, label }
}

function parseSaved(value: unknown, now: number): SavedPlace | null {
  if (!isRecord(value)) return null
  const { id, kind } = value
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null
  if (kind !== 'HOME' && kind !== 'WORK' && kind !== 'CUSTOM') return null
  if (!isPlaceId(value.placeId)) return null
  // Home and Work always carry their own name, whatever was stored.
  const label = kind === 'HOME' ? 'Home' : kind === 'WORK' ? 'Work' : cleanLabel(value.label, MAX_LABEL_LENGTH)
  const savedAt = validTime(value.savedAt, now)
  return label === null || savedAt === null ? null : { id, kind, label, placeId: value.placeId, savedAt }
}

function parseRecent(value: unknown, now: number): RecentJourney | null {
  if (!isRecord(value)) return null
  const { id, travelMode } = value
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null
  if (typeof travelMode !== 'string' || !isTravelMode(travelMode)) return null
  const origin = value.origin === CURRENT_LOCATION ? CURRENT_LOCATION : parseEndpoint(value.origin)
  const destination = parseEndpoint(value.destination)
  const searchedAt = validTime(value.searchedAt, now)
  if (origin === null || destination === null || searchedAt === null) return null
  return { id, origin, destination, travelMode, searchedAt }
}

export function recentKey(journey: Pick<RecentJourney, 'origin' | 'destination' | 'travelMode'>): string {
  const origin = journey.origin === CURRENT_LOCATION ? CURRENT_LOCATION : journey.origin.placeId
  return `${origin}>${journey.destination.placeId}@${journey.travelMode}`
}

/** Drops expired records and enforces the caps; newest recent journey first. */
export function normalizePlaces(data: PlacesData, now: number): PlacesData {
  const saved: SavedPlace[] = []
  const kinds = new Set<SavedPlaceKind>()
  const labels = new Set<string>()
  for (const place of data.saved) {
    if (place.kind !== 'CUSTOM') {
      if (kinds.has(place.kind)) continue
      kinds.add(place.kind)
    }
    const key = place.label.toLowerCase()
    if (labels.has(key)) continue
    labels.add(key)
    if (saved.length < MAX_SAVED_PLACES) saved.push(place)
  }
  const seen = new Set<string>()
  const recent = [...data.recent]
    .filter((journey) => now - journey.searchedAt <= RECENT_TTL_MS)
    .sort((a, b) => b.searchedAt - a.searchedAt)
    .filter((journey) => {
      const key = recentKey(journey)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_RECENT_JOURNEYS)
  return { saved, recent }
}

export type ParseOutcome = { data: PlacesData; status: 'empty' | 'ok' | 'discarded' }

/**
 * Reads the stored text. Anything unreadable (not JSON, wrong shape, another schema version) gives an empty
 * result with `discarded`, so the caller can replace it; single bad records are dropped without losing the rest.
 */
export function parsePlaces(raw: string | null, now: number): ParseOutcome {
  if (raw === null) return { data: EMPTY_PLACES, status: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { data: EMPTY_PLACES, status: 'discarded' }
  }
  if (!isRecord(parsed) || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.saved) || !Array.isArray(parsed.recent)) {
    return { data: EMPTY_PLACES, status: 'discarded' }
  }
  const saved = parsed.saved.map((value) => parseSaved(value, now)).filter((value): value is SavedPlace => value !== null)
  const recent = parsed.recent.map((value) => parseRecent(value, now)).filter((value): value is RecentJourney => value !== null)
  return { data: normalizePlaces({ saved, recent }, now), status: 'ok' }
}

export function serializePlaces(data: PlacesData): string {
  return JSON.stringify({ version: SCHEMA_VERSION, saved: data.saved, recent: data.recent })
}

// ---- changes (pure: each returns the new data, or the reason it was refused) ----

export type PlacesError = 'LIMIT' | 'LABEL_TAKEN' | 'INVALID_LABEL' | 'INVALID_PLACE' | 'NOT_FOUND' | 'FIXED_LABEL'
export type Change<T = PlacesData> = { ok: true; data: T } | { ok: false; error: PlacesError }

export const PLACES_ERROR_MESSAGES: Readonly<Record<PlacesError, string>> = {
  LIMIT: `You can save up to ${MAX_SAVED_PLACES} places. Remove one to add another.`,
  LABEL_TAKEN: 'You already have a place with that name.',
  INVALID_LABEL: `Give the place a name of up to ${MAX_LABEL_LENGTH} characters.`,
  INVALID_PLACE: 'Choose a place from the suggestions first.',
  NOT_FOUND: 'That place is no longer saved.',
  FIXED_LABEL: 'Home and Work keep their names.',
}

function labelTaken(saved: readonly SavedPlace[], label: string, exceptId: string | null): boolean {
  const key = label.toLowerCase()
  return saved.some((place) => place.id !== exceptId && place.label.toLowerCase() === key)
}

/** Saves Home or Work (replacing the previous one) or a new custom place. */
export function addSavedPlace(
  data: PlacesData,
  input: { kind: SavedPlaceKind; label?: string; placeId: string },
  id: string,
  now: number,
): Change {
  if (!isPlaceId(input.placeId)) return { ok: false, error: 'INVALID_PLACE' }
  if (input.kind !== 'CUSTOM') {
    const label = input.kind === 'HOME' ? 'Home' : 'Work'
    const existing = data.saved.find((place) => place.kind === input.kind)
    const others = data.saved.filter((place) => place.kind !== input.kind)
    if (labelTaken(others, label, null)) return { ok: false, error: 'LABEL_TAKEN' }
    const place: SavedPlace = { id: existing?.id ?? id, kind: input.kind, label, placeId: input.placeId, savedAt: now }
    const saved = existing ? data.saved.map((item) => (item.id === existing.id ? place : item)) : [...data.saved, place]
    if (saved.length > MAX_SAVED_PLACES) return { ok: false, error: 'LIMIT' }
    return { ok: true, data: { ...data, saved } }
  }
  const label = cleanLabel(input.label, MAX_LABEL_LENGTH)
  if (label === null) return { ok: false, error: 'INVALID_LABEL' }
  if (RESERVED_LABELS.has(label.toLowerCase()) || labelTaken(data.saved, label, null)) return { ok: false, error: 'LABEL_TAKEN' }
  if (data.saved.length >= MAX_SAVED_PLACES) return { ok: false, error: 'LIMIT' }
  return { ok: true, data: { ...data, saved: [...data.saved, { id, kind: 'CUSTOM', label, placeId: input.placeId, savedAt: now }] } }
}

/** Renames a custom place and/or points it at another place. */
export function updateSavedPlace(data: PlacesData, id: string, patch: { label?: string; placeId?: string }, now: number): Change {
  const current = data.saved.find((place) => place.id === id)
  if (!current) return { ok: false, error: 'NOT_FOUND' }
  let label = current.label
  if (patch.label !== undefined && patch.label.trim() !== current.label) {
    if (current.kind !== 'CUSTOM') return { ok: false, error: 'FIXED_LABEL' }
    const cleaned = cleanLabel(patch.label, MAX_LABEL_LENGTH)
    if (cleaned === null) return { ok: false, error: 'INVALID_LABEL' }
    if (RESERVED_LABELS.has(cleaned.toLowerCase()) || labelTaken(data.saved, cleaned, id)) return { ok: false, error: 'LABEL_TAKEN' }
    label = cleaned
  }
  let placeId = current.placeId
  if (patch.placeId !== undefined) {
    if (!isPlaceId(patch.placeId)) return { ok: false, error: 'INVALID_PLACE' }
    placeId = patch.placeId
  }
  return { ok: true, data: { ...data, saved: data.saved.map((place) => (place.id === id ? { ...place, label, placeId, savedAt: now } : place)) } }
}

export function removeSavedPlace(data: PlacesData, id: string): PlacesData {
  return { ...data, saved: data.saved.filter((place) => place.id !== id) }
}

/** Records a journey search; searching the same journey again moves it to the top instead of repeating it. */
export function recordRecentJourney(
  data: PlacesData,
  input: { origin: JourneyEndpoint | typeof CURRENT_LOCATION; destination: JourneyEndpoint; travelMode: RecentJourney['travelMode'] },
  id: string,
  now: number,
): PlacesData {
  const origin = input.origin === CURRENT_LOCATION ? CURRENT_LOCATION : parseEndpoint(input.origin)
  const destination = parseEndpoint(input.destination)
  if (origin === null || destination === null) return data
  const journey: RecentJourney = { id, origin, destination, travelMode: input.travelMode, searchedAt: now }
  const key = recentKey(journey)
  const rest = data.recent.filter((item) => recentKey(item) !== key)
  return normalizePlaces({ ...data, recent: [journey, ...rest] }, now)
}

export function removeRecentJourney(data: PlacesData, id: string): PlacesData {
  return { ...data, recent: data.recent.filter((journey) => journey.id !== id) }
}

export function clearRecentJourneys(data: PlacesData): PlacesData {
  return { ...data, recent: [] }
}
