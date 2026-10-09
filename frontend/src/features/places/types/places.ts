import type { TravelMode } from '../../route/types/travelMode.ts'

/**
 * What RouteView keeps about a person's places, in the browser only.
 *
 * Google Maps Platform content may not be stored beyond a Place ID (and, for a short time, coordinates). So a
 * record holds the Place ID plus a label: the person's own words for a saved place, or the short name that was
 * shown when a journey was searched (recent journeys, which expire). Coordinates, addresses and GPS fixes are
 * never stored: a place is looked up again from its Place ID when it is used.
 */

export type SavedPlaceKind = 'HOME' | 'WORK' | 'CUSTOM'

export interface SavedPlace {
  id: string
  kind: SavedPlaceKind
  /** "Home" / "Work" for those kinds; the person's own name for a custom place. */
  label: string
  placeId: string
  savedAt: number
}

/** A previous Current Location start. Never a coordinate: the position is asked for again when repeated. */
export const CURRENT_LOCATION = 'CURRENT_LOCATION'
export type CurrentLocationOrigin = typeof CURRENT_LOCATION

export interface JourneyEndpoint {
  placeId: string
  /** The short name shown when the journey was searched. Display only; the place is resolved from `placeId`. */
  label: string
}

export interface RecentJourney {
  id: string
  origin: JourneyEndpoint | CurrentLocationOrigin
  destination: JourneyEndpoint
  travelMode: TravelMode
  searchedAt: number
}

export interface PlacesData {
  saved: SavedPlace[]
  recent: RecentJourney[]
}
