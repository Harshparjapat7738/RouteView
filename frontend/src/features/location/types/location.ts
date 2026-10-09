/**
 * A geographic location the user explicitly chose from the search suggestions.
 * "Not selected" is represented by `null`; typed text alone is never a selection.
 */
export interface LocationSelection {
  name: string
  latitude: number
  longitude: number
  /** Provider place identifier, when the provider supplies one. */
  placeId?: string
  /** Set when this is the device position (never a typed or searched place). Its coordinates are not stored anywhere. */
  origin?: 'CURRENT_LOCATION'
}

/** One entry in the suggestion list. Opaque to the UI apart from its display text. */
export interface LocationSuggestion {
  id: string
  primaryText: string
  secondaryText?: string
}

/**
 * Provider-independent location search. The UI depends only on this interface;
 * the Google Places implementation lives in `services/googlePlacesSearch.ts`.
 */
export interface LocationSearchService {
  suggest(query: string): Promise<LocationSuggestion[]>
  /** Resolves a suggestion returned by the latest `suggest` call into a selection. */
  select(suggestionId: string): Promise<LocationSelection>
  /** Looks a place up again from its Place ID (saved places, recent journeys). Nothing but the ID is kept between visits. */
  resolve(placeId: string): Promise<LocationSelection>
}
