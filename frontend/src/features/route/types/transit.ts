/** One step of a public-transit journey: a walking part or a ride. Only what the routing provider reported. */
export interface TransitStep {
  kind: 'walk' | 'ride'
  /** Name of the line, e.g. "Violet Line"; empty for walking or when unknown. */
  lineName: string
  /** The provider's vehicle type for a ride, e.g. "SUBWAY", "HEAVY_RAIL", "BUS"; empty for walking. */
  vehicleType: string
  departureStop: string
  arrivalStop: string
  /** RFC 3339 time, or null when not reported. */
  departureTime: string | null
  arrivalTime: string | null
  headsign: string
  stopCount: number
  distanceMeters: number
  durationSeconds: number
}

export interface TransitDetails {
  steps: readonly TransitStep[]
  /** Changes between rides. */
  transfers: number
  departureTime: string | null
  arrivalTime: string | null
}
