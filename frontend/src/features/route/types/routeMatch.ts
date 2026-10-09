import type { DetectedArea } from './detectedArea.ts'

/**
 * How one route relates to the active passing-area search, as the route comparison needs it.
 * Routes that match nothing have no RouteMatch.
 */
export interface RouteMatch {
  /** The route's own matched areas, in travel order (`sequence`). */
  areas: readonly DetectedArea[]
  /** Number of selected areas the search requires; null while the user is only typing (no selected areas). */
  expected: number | null
  /** The route passes through every required area. A route that only has some of them is not complete. */
  complete: boolean
}
