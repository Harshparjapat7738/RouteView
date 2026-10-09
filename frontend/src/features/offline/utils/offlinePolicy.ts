import type { TravelMode } from '../../route/types/travelMode.ts'

/**
 * What may be kept on the device for offline use, per source of journey content.
 *
 * Google (cars, walking, cycling, Train, Metro): the Google Maps Platform terms restrict caching of Routes API content
 * (routes, polylines, directions, transit details, durations) and of Places content. Only Place IDs may be stored without
 * a time limit (Service Specific Terms, "Google ID Caching"). So a Google-powered journey is kept as intent only: Place IDs,
 * short labels that expire after 30 days (the Google caching window), the mode and the person's preferences.
 * There is deliberately no switch that stores any Google route content. Metro is Google route content too (the lines, stations,
 * times and fare come from Google's transit response), so a Metro journey is intent only as well.
 *
 * Bus: RouteView's own planner over a static GTFS dataset. The Delhi Open Transit Data terms (clause 22) allow the portal's
 * material to be reproduced free of charge when it is reproduced accurately, not in a misleading context, and with the source
 * prominently acknowledged; this implementation keeps the stop sequence unchanged, labels it stale-able, and shows the source.
 * That is the maintainers' reading of the terms, not legal advice: if the licence is confirmed not to allow it, set
 * `bus.itinerary` to false and Bus journeys are kept as intent only.
 */
export interface OfflinePolicy {
  bus: { itinerary: boolean }
}

export const DEFAULT_OFFLINE_POLICY: OfflinePolicy = Object.freeze({ bus: Object.freeze({ itinerary: true }) }) as OfflinePolicy

/** Display names of the dataset families, for the source line. Unknown ids are shown as reported. */
export const DATA_SOURCE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  DELHI_BUS: 'Delhi Open Transit Data (bus, GTFS)',
})
export const DEFAULT_DATA_SOURCE_NAME = 'Delhi Open Transit Data (bus, GTFS)'

export function dataSourceName(source: string | null): string {
  if (source === null) return DEFAULT_DATA_SOURCE_NAME
  return DATA_SOURCE_NAMES[source] ?? source
}

/** Only the RouteView Bus planner produces an itinerary that may be kept; everything else is Google content. */
export function itineraryAllowed(mode: TravelMode, policy: OfflinePolicy = DEFAULT_OFFLINE_POLICY): boolean {
  return mode === 'BUS' && policy.bus.itinerary
}

export const MAX_OFFLINE_JOURNEYS = 10
/** Google display names may be kept for 30 days at most (the same window as recent journeys). */
export const OFFLINE_LABEL_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** A saved itinerary older than this is called out as possibly out of date. */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
/** A dataset imported longer ago than this is called out as old. */
export const DATASET_OLD_AFTER_MS = 180 * 24 * 60 * 60 * 1000
/** Upper bound of what is written, so one save can never fill the browser's storage. */
export const MAX_STORED_CHARS = 300_000
