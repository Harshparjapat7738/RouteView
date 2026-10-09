import type { TravelPreferences } from '../../preferences/types/preferences.ts'
import type { TravelMode } from '../../route/types/travelMode.ts'

/**
 * A journey kept on this device for offline viewing. Two kinds of content, never mixed up:
 *
 *  - INTENT ONLY: the two places (Place IDs plus short labels), the travel mode and the person's preferences. Nothing of any
 *    calculated route. Used for every journey that comes from Google (cars, walking, cycling, Train, Metro) and whenever the
 *    transit data may not be kept. Offline it shows what was planned and says that directions need a connection.
 *  - ITINERARY: RouteView's own Bus planner result over a static GTFS dataset, reduced to its stop sequence, with the
 *    dataset's source and version and the time it was saved. No coordinates, geometry, polylines or Google content.
 */
export const OFFLINE_SCHEMA_VERSION = 1

export const CURRENT_LOCATION_ORIGIN = 'CURRENT_LOCATION'
export type CurrentLocationOrigin = typeof CURRENT_LOCATION_ORIGIN

export interface OfflineEndpoint {
  placeId: string
  /** The short name shown when the journey was saved; Google content, so it expires (see OFFLINE_LABEL_TTL_MS). Null once expired. */
  label: string | null
}

export type OfflineIntentReason =
  /** The journey is Google route content (or has no RouteView itinerary): it can only be calculated again online. */
  | 'GOOGLE_CONTENT'
  /** The transit dataset's terms are not confirmed to allow keeping it, so only the intent was kept. */
  | 'DATA_TERMS'
  /** A bus journey that carried no usable stop sequence. */
  | 'NO_ITINERARY'

export interface OfflineBusWalk {
  type: 'WALK'
  role: 'FIRST_MILE' | 'LAST_MILE'
  /** Whole minutes, straight-line estimate; null when unknown. */
  minutes: number | null
}

export interface OfflineBusRide {
  type: 'BUS'
  route: string
  agency: string | null
  headsign: string | null
  /** Stop names from boarding to exit, inclusive, in riding order. */
  stops: readonly string[]
  /** Scheduled clock times (HH:MM, Delhi time) when the journey was saved; schedule data, never live. */
  departure: string | null
  arrival: string | null
}

export interface OfflineBusTransfer {
  type: 'TRANSFER'
  stop: string
  fromRoute: string | null
  toRoute: string | null
  waitMinutes: number | null
}

export type OfflineStep = OfflineBusWalk | OfflineBusRide | OfflineBusTransfer

export interface OfflineItinerary {
  /** Identifies the dataset family, e.g. "DELHI_BUS"; display text comes from the data policy. */
  source: string | null
  /** The dataset version the itinerary was planned from. Null when the backend reported none. */
  datasetVersion: string | null
  /** yyyy-MM-dd end of the dataset's own service calendar, when it has one. */
  servicePeriodEnd: string | null
  /** ISO instant the dataset was imported by the backend, when reported. */
  datasetImportedAt: string | null
  transfers: number
  steps: readonly OfflineStep[]
}

export interface OfflineJourney {
  id: string
  /** Epoch ms when the person saved (or last updated) it. */
  savedAt: number
  travelMode: TravelMode
  origin: OfflineEndpoint | CurrentLocationOrigin
  destination: OfflineEndpoint
  /** The preferences that were selected when it was saved; shown, never re-applied automatically. */
  preferences: TravelPreferences
  itinerary: OfflineItinerary | null
  /** Set exactly when `itinerary` is null: why only the intent was kept. */
  intentReason: OfflineIntentReason | null
}

export interface OfflineData {
  journeys: readonly OfflineJourney[]
}
