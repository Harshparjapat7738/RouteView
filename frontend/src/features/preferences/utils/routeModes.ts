import type { Route } from '../../route/types/route.ts'
import type { TravelMode } from '../../route/types/travelMode.ts'

const METRO_TYPES = new Set(['SUBWAY', 'METRO', 'METRO_RAIL', 'URBAN_RAIL'])
const BUS_TYPES = new Set(['BUS', 'INTERCITY_BUS', 'TROLLEYBUS'])
const TRAIN_TYPES = new Set(['HEAVY_RAIL', 'COMMUTER_TRAIN', 'HIGH_SPEED_TRAIN', 'LONG_DISTANCE_TRAIN', 'RAIL', 'TRAIN'])
/** Vehicles RouteView has no travel mode for: they are neither avoidable nor a reason to doubt the check. */
const OTHER_TYPES = new Set(['TRAM', 'LIGHT_RAIL', 'MONORAIL', 'FERRY', 'CABLE_CAR', 'GONDOLA_LIFT', 'FUNICULAR', 'SHARE_TAXI', 'OTHER'])

type VehicleMode = TravelMode | 'OTHER' | null

/** The RouteView travel mode of a provider vehicle type; null when the type is not recognised. */
export function vehicleMode(vehicleType: string | null | undefined): VehicleMode {
  const type = (vehicleType ?? '').trim().toUpperCase()
  if (METRO_TYPES.has(type)) return 'METRO'
  if (BUS_TYPES.has(type)) return 'BUS'
  if (TRAIN_TYPES.has(type)) return 'TRAIN'
  return OTHER_TYPES.has(type) ? 'OTHER' : null
}

export interface RouteModes {
  /** Travel modes the journey is known to use: the mode it was searched with plus every identified transit leg. */
  modes: ReadonlySet<TravelMode>
  /** Transit legs whose vehicle could not be identified. Such a leg is never assumed to be (or not to be) an avoided mode. */
  unidentifiedLegs: number
}

/**
 * Which travel modes a journey uses, from what the routing engines reported. Walking to and from stops is part of
 * every transit journey and is not counted as the Walking travel mode (use "Less walking" for that).
 */
export function modesOfRoute(route: Route, searchedWith: TravelMode): RouteModes {
  const modes = new Set<TravelMode>([searchedWith])
  let unidentified = 0
  const note = (mode: VehicleMode) => {
    if (mode === null) unidentified += 1
    else if (mode !== 'OTHER') modes.add(mode)
  }
  if (route.bus !== undefined) {
    modes.add('BUS')
  }
  if (route.metro !== undefined) {
    for (const segment of route.metro.segments) {
      if (segment.type === 'METRO') modes.add('METRO')
      else if (segment.type === 'TRANSIT') note(vehicleMode(segment.line?.vehicleType))
    }
  } else if (route.transit !== undefined) {
    for (const step of route.transit.steps) {
      if (step.kind === 'ride') note(vehicleMode(step.vehicleType))
    }
  }
  return { modes, unidentifiedLegs: unidentified }
}
