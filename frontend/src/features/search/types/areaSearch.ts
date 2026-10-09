import type { AreaType, DetectedArea } from '../../route/types/detectedArea.ts'
import type { Route } from '../../route/types/route.ts'

/**
 * A search request. Today it holds exactly one term ("one query → one area"); it is a list so that a later
 * multi-area search ("Neharpar + Sector 88") only has to change how the per-term matches are combined.
 */
export interface AreaSearchQuery {
  /** What the user typed, trimmed and limited in length. */
  text: string
  /** Normalised search terms (lower case, single spaces). */
  terms: readonly string[]
}

/** How well an area name matches the query, best first. */
export type MatchQuality = 'exact' | 'prefix' | 'contains'

/** One calculated route that passes through the matched area. Reuses the session's own route and area objects. */
export interface MatchingRoute {
  route: Route
  /** The route's own detected area (its `sequence` is the area's place in this route's journey). */
  area: DetectedArea
}

/** A geographical area that matched, with the routes that pass through it. Never a place or business. */
export interface AreaSearchResult {
  /** Identifies this result in lists; not shown to users. */
  key: string
  /** Id of the area as detected on the first matching route. */
  areaId: string
  areaName: string
  areaType: AreaType
  quality: MatchQuality
  /** Ordered by route number. Never empty. */
  matchingRoutes: readonly MatchingRoute[]
}

export type AreaSearchOutcome =
  /** There is no usable Route Session: nothing to search in. */
  | { status: 'no-routes' }
  /** The query is empty: nothing is shown. */
  | { status: 'empty-query' }
  | { status: 'no-match'; query: string }
  | { status: 'found'; query: string; results: readonly AreaSearchResult[] }

/**
 * An area the user has chosen as a filter. Kept as a small record (not a route object) so it survives
 * re-renders; `key` is the cross-route identity (normalised name + type), `areaId` the id it had when chosen.
 */
export interface SelectedArea {
  key: string
  areaId: string
  areaName: string
  areaType: AreaType
}

/** One route's relation to the selected areas. */
export interface RouteAreaMatch {
  route: Route
  /** One detected area per selected area this route passes through, in the route's travel order. */
  matchedAreas: readonly DetectedArea[]
  /** True when the route passes through every selected area. */
  complete: boolean
}

/** The routes that pass through some or all of the selected areas. */
export interface MultiAreaMatch {
  /** The selected areas that were matched against (duplicates removed). */
  selected: readonly SelectedArea[]
  /** Routes that pass through every selected area, by route number. */
  fullMatches: readonly RouteAreaMatch[]
  /** Routes that pass through at least one but not every selected area, by route number. */
  partialMatches: readonly RouteAreaMatch[]
}
