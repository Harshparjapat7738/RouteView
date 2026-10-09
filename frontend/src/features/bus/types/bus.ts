import type { LatLng } from '../../../types/geo.ts'
import type { Accessibility } from '../../accessibility/types/accessibility.ts'

export type BusSegmentType = 'WALK' | 'BUS' | 'TRANSFER'
export type BusWalkRole = 'FIRST_MILE' | 'LAST_MILE'
export type BusStopRole = 'BOARDING' | 'INTERMEDIATE' | 'TRANSFER' | 'EXIT'

/** Why the backend found no bus journey: a stable code, turned into plain words by the UI. */
export type BusNoRouteReason = 'NO_BUS_DATA' | 'NO_STOP_NEAR_START' | 'NO_STOP_NEAR_DESTINATION' | 'NO_SERVICE' | 'NO_JOURNEY'

/** A real bus stop of the dataset. `key` is its stable id: the same stop has the same key in every part of the journey. */
export interface BusStop {
  key: string
  name: string
  latitude: number
  longitude: number
  role: BusStopRole
  /** What the dataset says about wheelchair access at this stop. Absent = unknown (never "accessible"). */
  accessibility?: Accessibility
}

/** The route the rider sits on. The number/name is display text; two routes with the same name are still two routes. */
export interface BusRouteRef {
  /** Route number or name as the operator shows it. */
  name: string
  agency: string | null
}

export interface BusSegment {
  type: BusSegmentType
  walkRole: BusWalkRole | null
  distanceMeters: number
  durationSeconds: number
  route: BusRouteRef | null
  /** Where this bus is heading, when the dataset (or the ride's last stop) says so. */
  headsign: string | null
  /** The headsign is the last stop of the ride's pattern, not a headsign from the dataset. */
  headsignIsTerminal: boolean
  boarding: BusStop | null
  exit: BusStop | null
  /** The real ordered stops of a ride, boarding to exit inclusive. */
  stops: readonly BusStop[]
  listedStopCount: number
  /** Hops between the listed stops (listed − 1): never the same number as listedStopCount. */
  stopToStopSegments: number
  departureTime: string | null
  arrivalTime: string | null
  waitSeconds: number
  /** Transfers: where the rider changes route. */
  transferStop: BusStop | null
  fromRoute: BusRouteRef | null
  toRoute: BusRouteRef | null
  /** This segment's own geometry (shape, stop sequence or an estimated walk); empty when the backend sent none. */
  path: readonly LatLng[]
  /** Walking distance/time are straight-line estimates. */
  estimated: boolean
}

/** The bus journey view of a Bus route: everything the card, the timeline and the map need. */
export interface BusJourney {
  /** Changes of route (staying on the same route is never a transfer). */
  transfers: number
  busLegCount: number
  /** Distinct stops listed along the whole journey. */
  listedStopCount: number
  walkingMeters: number
  walkingSeconds: number
  rideSeconds: number
  waitSeconds: number
  segments: readonly BusSegment[]
  /** Every distinct stop of the journey in travel order, with its role. These are bus stops, never Journey Stops / Passing Areas. */
  stops: readonly BusStop[]
  /** A fare is shown only when the backend has a reliable source; otherwise null and the UI says "Fare unavailable". */
  fare: { currency: string; amount: string } | null
  /** Times come from the published schedule, not from live vehicle positions. */
  timetableBasis: 'STATIC_SCHEDULE'
  geometrySource: 'GTFS_SHAPES' | 'STOP_SEQUENCE' | 'MIXED' | null
  departureTime: string | null
  arrivalTime: string | null
  notices: readonly string[]
  /** Version of the static dataset the journey was planned from, or null. */
  datasetVersion: string | null
  /** What the backend reported about that dataset (its source id, import time and service period); absent when it reported none. */
  datasetInfo?: BusDatasetInfo | null
}

/** The static dataset behind a bus journey, as reported by the backend. Dates are yyyy-MM-dd, `importedAt` an ISO instant. */
export interface BusDatasetInfo {
  source: string | null
  sourceVersion: string | null
  importedAt: string | null
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
}
