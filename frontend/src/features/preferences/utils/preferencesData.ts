import { TRAVEL_MODES, isTravelMode, type TravelMode } from '../../route/types/travelMode.ts'
import { CRITERIA, DEFAULT_PREFERENCES, type AccessibilityPreferences, type RankingPreferences, type TravelPreferences } from '../types/preferences.ts'

export const PREFERENCES_KEY = 'routeview.preferences'
export const PREFERENCES_VERSION = 1

export function isDefaultPreferences(preferences: TravelPreferences): boolean {
  return preferences.avoid.length === 0 && CRITERIA.every((criterion) => !preferences.prefer[criterion.id]) && !preferences.accessibility.stepFree && !preferences.accessibility.avoidInaccessible
}

/** Keeps only supported travel modes, once each, in the canonical order of the mode selector. */
export function normalizeAvoid(modes: readonly unknown[]): TravelMode[] {
  const wanted = new Set(modes.filter((mode): mode is TravelMode => typeof mode === 'string' && isTravelMode(mode)))
  return TRAVEL_MODES.filter((mode) => wanted.has(mode))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type PreferencesParse = { preferences: TravelPreferences; status: 'empty' | 'ok' | 'discarded' }

/** Reads stored text; anything unreadable or of another schema version gives the defaults (`discarded`). */
export function parsePreferences(raw: string | null): PreferencesParse {
  if (raw === null) return { preferences: DEFAULT_PREFERENCES, status: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { preferences: DEFAULT_PREFERENCES, status: 'discarded' }
  }
  if (!isRecord(parsed) || parsed.version !== PREFERENCES_VERSION || !isRecord(parsed.prefer) || !Array.isArray(parsed.avoid)) {
    return { preferences: DEFAULT_PREFERENCES, status: 'discarded' }
  }
  const prefer = { ...DEFAULT_PREFERENCES.prefer }
  for (const criterion of CRITERIA) {
    prefer[criterion.id] = parsed.prefer[criterion.id] === true
  }
  // Added after the first release: stored data without it is still valid and means "off". Only a literal true turns a switch on.
  const stored = isRecord(parsed.accessibility) ? parsed.accessibility : {}
  const accessibility: AccessibilityPreferences = { stepFree: stored.stepFree === true, avoidInaccessible: stored.avoidInaccessible === true }
  return { preferences: { prefer, accessibility, avoid: normalizeAvoid(parsed.avoid) }, status: 'ok' }
}

export function serializePreferences(preferences: TravelPreferences): string {
  const prefer = {} as RankingPreferences
  for (const criterion of CRITERIA) prefer[criterion.id] = preferences.prefer[criterion.id]
  const { stepFree, avoidInaccessible } = preferences.accessibility
  // Written only when something is on, so data stays identical to the first release for people who do not use it.
  const accessibility = stepFree || avoidInaccessible ? { accessibility: { stepFree, avoidInaccessible } } : {}
  return JSON.stringify({ version: PREFERENCES_VERSION, prefer, ...accessibility, avoid: normalizeAvoid(preferences.avoid) })
}

export type PreferencesBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): PreferencesBackend | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Never throws: blocked or unreadable storage gives the defaults, and unreadable data is removed. */
export function loadPreferences(backend: PreferencesBackend | null = browserStorage()): TravelPreferences {
  if (backend === null) return DEFAULT_PREFERENCES
  try {
    const outcome = parsePreferences(backend.getItem(PREFERENCES_KEY))
    if (outcome.status === 'discarded') backend.removeItem(PREFERENCES_KEY)
    return outcome.preferences
  } catch {
    return DEFAULT_PREFERENCES
  }
}

/** False when the browser refused the write (blocked or full storage). Defaults remove the key. */
export function savePreferences(preferences: TravelPreferences, backend: PreferencesBackend | null = browserStorage()): boolean {
  if (backend === null) return false
  try {
    if (isDefaultPreferences(preferences)) backend.removeItem(PREFERENCES_KEY)
    else backend.setItem(PREFERENCES_KEY, serializePreferences(preferences))
    return true
  } catch {
    return false
  }
}
