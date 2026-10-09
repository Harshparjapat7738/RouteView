/**
 * What a dataset says about wheelchair access at one station or stop. Three states that are never merged:
 * ACCESSIBLE / INACCESSIBLE only when the source said so explicitly, UNKNOWN for everything else (no data, an empty or an
 * unrecognised value). "Unknown" is never treated as "accessible".
 *
 * `source` and `sourceVersion` name the dataset the statement comes from (so its age can be judged); both are null for UNKNOWN.
 * The dataset field (GTFS wheelchair_boarding) says nothing about lifts, step-free connections inside a station or the walk to it.
 */
export type AccessStatus = 'ACCESSIBLE' | 'INACCESSIBLE' | 'UNKNOWN'

export interface Accessibility {
  status: AccessStatus
  source: string | null
  sourceVersion: string | null
}

export const UNKNOWN_ACCESS: Accessibility = Object.freeze({ status: 'UNKNOWN', source: null, sourceVersion: null }) as Accessibility

/** One station or stop of a journey that matters for access: where the rider boards, leaves or changes. */
export interface AccessPoint {
  key: string
  name: string
  kind: 'BOARDING' | 'EXIT' | 'TRANSFER'
  accessibility: Accessibility
}

/**
 * How a route's stations were found:
 *  HAS_INACCESSIBLE  at least one relevant station is explicitly listed as not accessible
 *  ALL_LISTED        every relevant station is explicitly listed as accessible (still not a guarantee for the whole journey)
 *  PARTIAL           some are listed as accessible, the rest are unknown
 *  UNKNOWN           none is listed
 * `applicable` is false for routes that have no station-level data model at all (cars, walking, Google train routes).
 */
export type AccessLevel = 'HAS_INACCESSIBLE' | 'ALL_LISTED' | 'PARTIAL' | 'UNKNOWN'

export interface RouteAccess {
  applicable: boolean
  points: readonly AccessPoint[]
  accessible: number
  inaccessible: number
  unknown: number
  level: AccessLevel
}
