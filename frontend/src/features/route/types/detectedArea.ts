import type { LatLng } from '../../../types/geo.ts'

/** Kinds of geographical area the backend can report. Never a business or point of interest. */
export const AREA_TYPES = [
  'VILLAGE',
  'LOCALITY',
  'SUBURB',
  'SECTOR',
  'TOWN',
  'CITY',
  'MUNICIPALITY',
  'DISTRICT',
  'OTHER',
] as const

export type AreaType = (typeof AREA_TYPES)[number]

/**
 * A geographical area a route passes through, as detected by the backend's Area Detection Engine.
 * It belongs to exactly one route; areas of different routes are never merged.
 */
export interface DetectedArea {
  /** Identifies the area in RouteView's database. */
  areaId: string
  name: string
  areaType: AreaType
  /** 1-based place in travel order. */
  sequence: number
  /** 0 = route start, 1 = route end: where the route first reaches the area. */
  positionAlongRoute: number
  distanceFromStartMeters: number
  /** The point on the route where the area is first reached (used to highlight it on the map). */
  location: LatLng
}
