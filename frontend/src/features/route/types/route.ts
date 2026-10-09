import type { LatLng } from '../../../types/geo.ts'
import type { DetectedArea } from './detectedArea.ts'
import type { BusJourney } from '../../bus/types/bus.ts'
import type { MetroJourney } from '../../metro/types/metro.ts'
import type { TransitDetails } from './transit.ts'

/** A calculated route in RouteView's own terms (no provider-specific data). */
export interface Route {
  id: string
  /** Position among the alternatives; 0 is the provider's preferred route. */
  index: number
  distanceMeters: number
  durationSeconds: number
  /** Short description such as "via NH19"; empty when unknown. */
  summary: string
  /** Route geometry as received from the backend (Google encoded polyline, precision 5). Never discarded: the Area Detection Engine consumes it. */
  encodedPolyline: string
  /** The same geometry decoded to coordinates for drawing and measuring. */
  path: readonly LatLng[]
  /** Geographical areas this route passes through, in travel order. Empty when none were detected. */
  detectedAreas: readonly DetectedArea[]
  /** Public-transit details (lines, stops, times, transfers); only present for Train and Metro routes. */
  transit?: TransitDetails
  /** Warnings the routing provider requires to be shown with this route (walking, cycling, two-wheeler). */
  warnings?: readonly string[]
  /** The metro journey view of a Metro route (stations, lines, interchanges, fare); never set for other modes. */
  metro?: MetroJourney
  /** The bus journey view of a Bus route (routes, transfers, listed stops, walking, fare status); never set for other modes. */
  bus?: BusJourney
}
