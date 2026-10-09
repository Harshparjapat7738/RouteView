/** Metro (Delhi first) types. Station and line data comes from the backend's imported dataset; nothing here is invented. */

import type { Accessibility } from '../../accessibility/types/accessibility.ts'

export type MetroSegmentType = 'WALK' | 'METRO' | 'TRANSFER' | 'TRANSIT'
export type MetroStationRole = 'BOARDING' | 'INTERMEDIATE' | 'INTERCHANGE' | 'EXIT'
export type MetroWalkRole = 'FIRST_MILE' | 'LAST_MILE'

export interface MetroLineRef {
  /** The dataset SERVICE (GTFS route); set only when exactly one service was determined. Never compare lines by name. */
  lineId: string | null
  /** The logical line (Blue Line = main + Vaishali branch); two lines are the same line when their groupId is equal. */
  groupId?: string | null
  name: string
  shortName: string
  /** #RRGGBB when the source provided one; never invented. */
  color: string | null
  vehicleType: string
  /** Service-specific part of the name (for example a branch), when the dataset has one. */
  branch?: string | null
}

export interface MetroStationRef {
  /** Set only when the station was matched to the imported dataset. */
  stationId: string | null
  name: string
  latitude: number | null
  longitude: number | null
  role: MetroStationRole
  /** The lines this journey uses at the station, each logical line once (empty when unmatched). */
  lines: readonly MetroLineRef[]
  /** The station is served by two or more logical lines (a genuine interchange), whichever line the journey uses. */
  interchange?: boolean
  /** What the dataset says about wheelchair access here. Absent = unknown (never "accessible"). */
  accessibility?: Accessibility
}

export interface MetroSegment {
  type: MetroSegmentType
  walkRole: MetroWalkRole | null
  distanceMeters: number
  durationSeconds: number
  line: MetroLineRef | null
  /** Direction as the routing provider reported it ("Towards ..."). */
  towards: string | null
  boarding: MetroStationRef | null
  exit: MetroStationRef | null
  stopCount: number
  /** Stations between boarding and exit; null when they could not be verified (then not listed). */
  intermediateStations: readonly MetroStationRef[] | null
  departureTime: string | null
  arrivalTime: string | null
  transferStation: MetroStationRef | null
  /** Set when the next ride starts at a differently named station. */
  transferToStation: MetroStationRef | null
  fromLine: MetroLineRef | null
  toLine: MetroLineRef | null
  /** Walking between the two rides; null when the provider reported none. */
  transferWalkMeters: number | null
  transferWalkSeconds: number | null
}

export interface MetroFare {
  currency: string
  /** Plain decimal text exactly as reported by the routing provider. */
  amount: string
}

export interface MetroDatasetRef {
  source: string
  sourceVersion: string
  /** yyyy-MM-dd or null. */
  sourceUpdatedAt: string | null
  importedAt: string | null
  /** The dataset's own calendar (yyyy-MM-dd) and weekdays; null / empty when it has none. Never extended or invented. */
  servicePeriodStart?: string | null
  servicePeriodEnd?: string | null
  operatingDays?: readonly string[]
}

export interface MetroJourney {
  /** The provider's fare, or null: shown as "Fare unavailable", never estimated. */
  fare: MetroFare | null
  transfers: number
  /** Stations listed for the metro rides (10 stations = 9 segments); null when they could not be verified. */
  stationCount: number | null
  /** Station-to-station segments travelled by metro, as the provider reported them; null when not reported for every ride. */
  travelledStops?: number | null
  walkingMeters: number
  walkingSeconds: number
  departureTime: string | null
  arrivalTime: string | null
  stationsVerified: boolean
  segments: readonly MetroSegment[]
  stations: readonly MetroStationRef[]
  dataset: MetroDatasetRef | null
  notices: readonly string[]
}

// ---- network (static data for the map layer)

export interface MetroNetworkStation {
  id: string
  name: string
  latitude: number
  longitude: number
  lineIds: readonly string[]
  /** The logical lines serving the station, each once. */
  groupIds?: readonly string[]
  interchange: boolean
}

export interface MetroNetworkPattern {
  pattern: string
  toward: string | null
  stationIds: readonly string[]
}

export interface MetroNetworkLine {
  id: string
  name: string
  shortName: string
  color: string | null
  groupId?: string | null
  groupName?: string | null
  branch?: string | null
  patterns: readonly MetroNetworkPattern[]
  /** The dataset's shapes for this service as [lat, lng] paths; empty when it has none. */
  shapes?: readonly (readonly { lat: number; lng: number }[])[]
}

export interface MetroNetwork {
  /** Null when no dataset has been imported: the layer is then unavailable. */
  dataset: MetroDatasetRef | null
  /** How lines are drawn: GTFS_SHAPES = the dataset's shapes; STATION_SEQUENCE = ordered station-to-station connections only. */
  geometry: 'STATION_SEQUENCE' | 'GTFS_SHAPES'
  stations: readonly MetroNetworkStation[]
  lines: readonly MetroNetworkLine[]
}
