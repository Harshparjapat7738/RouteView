import type { TravelMode } from '../../route/types/travelMode.ts'

/**
 * Personal travel preferences. Two different things, kept apart on purpose:
 *  - ranking (`prefer`) only changes the ORDER of routes that exist; it never removes one;
 *  - filtering (`avoid`) removes journeys that use an avoided travel mode.
 * Nothing here is sent to a server: the preferences are applied to the routes already in the Route Session.
 */
export interface RankingPreferences {
  fastest: boolean
  lowestFare: boolean
  fewerTransfers: boolean
  lessWalking: boolean
}

export type CriterionId = keyof RankingPreferences

/**
 * Accessibility-aware selection. Both only use what the datasets explicitly state about stations and stops (accessible,
 * not accessible, unknown); unknown is never treated as accessible, and neither switch is on by default.
 *  - stepFree: routes whose stations are all listed as accessible come first (ranking; nothing is hidden);
 *  - avoidInaccessible: routes that use a station listed as not accessible are hidden, when another route exists.
 */
export interface AccessibilityPreferences {
  stepFree: boolean
  avoidInaccessible: boolean
}

export interface TravelPreferences {
  prefer: RankingPreferences
  accessibility: AccessibilityPreferences
  /** Travel modes whose journeys are not shown. Canonical order, no duplicates. */
  avoid: readonly TravelMode[]
}

export const CRITERIA: readonly { id: CriterionId; label: string; short: string }[] = [
  { id: 'fastest', label: 'Fastest journey', short: 'Fastest' },
  { id: 'lowestFare', label: 'Lowest fare', short: 'Lowest fare' },
  { id: 'fewerTransfers', label: 'Fewer transfers', short: 'Fewer transfers' },
  { id: 'lessWalking', label: 'Less walking', short: 'Less walking' },
]

export const DEFAULT_PREFERENCES: TravelPreferences = Object.freeze({
  prefer: Object.freeze({ fastest: false, lowestFare: false, fewerTransfers: false, lessWalking: false }),
  accessibility: Object.freeze({ stepFree: false, avoidInaccessible: false }),
  avoid: Object.freeze([]) as readonly TravelMode[],
}) as TravelPreferences

/**
 * How one selected ranking preference was handled for the routes at hand:
 *  applied        the routes were compared on it (all of them have the data) and it changed or confirmed the order
 *  no-difference  comparable, but the routes do not differ (or there is only one route)
 *  unavailable    some or all routes lack the data, so it could not be applied
 *  not-applicable the travel mode has no such thing (for example transfers on a car journey)
 */
export type CriterionStatus = 'applied' | 'no-difference' | 'unavailable' | 'not-applicable'

export interface CriterionOutcome {
  id: CriterionId
  status: CriterionStatus
  /** Plain-language reason, for every status except `applied`. */
  reason: string | null
}

/** What applying the preferences did to one Route Session's routes. Derived; never stored. */
export interface PreferenceOutcome {
  /** Preferences that actually shaped the order, in display order. */
  ranked: readonly CriterionId[]
  /** One entry per selected ranking preference. */
  criteria: readonly CriterionOutcome[]
  /** Routes before filtering. */
  totalCount: number
  /** Routes removed because they use an avoided mode. */
  hiddenCount: number
  /** The avoided modes found in the removed routes. */
  hiddenModes: readonly TravelMode[]
  /** Everything was removed (or nothing was requested because the searched mode is avoided). */
  noMatch: boolean
  /** The search was not made at all because its travel mode is avoided. */
  notSearched: boolean
  /** Shown routes with a transit leg whose mode could not be identified, so avoiding could not be verified for it. */
  unverifiedRoutes: number
  /** What the accessibility preferences did; null when neither is on. */
  accessibility: AccessibilityOutcome | null
}

/**
 * What the accessibility preferences did to the routes at hand. Counts are over the routes that were left after the
 * travel-mode filter. Derived; never stored.
 */
export interface AccessibilityOutcome {
  stepFree: boolean
  avoidInaccessible: boolean
  /** At least one route has station data to look at (Metro and Bus journeys); false means nothing could be applied. */
  applicable: boolean
  /** The step-free order changed the order of the routes. */
  ranked: boolean
  /** Routes whose every relevant station is listed as accessible (still no guarantee for the whole journey). */
  verifiedRoutes: number
  /** Routes that use a station listed as not accessible (before any were hidden). */
  inaccessibleRoutes: number
  /** Routes with at least one station whose accessibility is unknown (including routes with no station data). */
  unknownRoutes: number
  /** Routes removed because they use a station listed as not accessible. */
  hiddenInaccessible: number
  /** Avoiding was asked for but every route uses such a station, so none was removed. */
  allInaccessible: boolean
  /** Routes looked at (after hiding). */
  routeCount: number
}
