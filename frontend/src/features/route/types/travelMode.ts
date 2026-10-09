import type { BusNoRouteReason } from '../../bus/types/bus.ts'
import { describeBusNoRoute } from '../../bus/utils/busFormat.ts'

/**
 * How the user travels. RouteView's own vocabulary: the backend maps it to the routing provider's modes
 * (Train and Metro are both public transit with different preferred transit types).
 */
export const TRAVEL_MODES = ['TWO_WHEELER', 'FOUR_WHEELER', 'WALKING', 'CYCLING', 'TRAIN', 'METRO', 'BUS'] as const

export type TravelMode = (typeof TRAVEL_MODES)[number]

/** The mode used until the user chooses another one: a normal car, like before travel modes existed. */
export const DEFAULT_TRAVEL_MODE: TravelMode = 'FOUR_WHEELER'

export interface TravelModeInfo {
  id: TravelMode
  /** Shown to the user. */
  label: string
  /** Public transit: routes come with lines, stops and times. */
  transit: boolean
  /** The routing provider documents this mode as beta: a short warning is shown with its routes. */
  limitedCoverage: boolean
}

export const TRAVEL_MODE_INFO: Readonly<Record<TravelMode, TravelModeInfo>> = {
  TWO_WHEELER: { id: 'TWO_WHEELER', label: 'Two Wheeler', transit: false, limitedCoverage: true },
  FOUR_WHEELER: { id: 'FOUR_WHEELER', label: 'Four Wheeler', transit: false, limitedCoverage: false },
  WALKING: { id: 'WALKING', label: 'Walking', transit: false, limitedCoverage: true },
  CYCLING: { id: 'CYCLING', label: 'Cycling', transit: false, limitedCoverage: true },
  TRAIN: { id: 'TRAIN', label: 'Train', transit: true, limitedCoverage: false },
  METRO: { id: 'METRO', label: 'Metro', transit: true, limitedCoverage: false },
  BUS: { id: 'BUS', label: 'Bus', transit: true, limitedCoverage: false },
}

/** Shown for Two Wheeler, Walking and Cycling (the provider's beta modes). */
export const LIMITED_COVERAGE_WARNING = 'Routes for this travel mode may have limited path coverage.'

export function isTravelMode(value: unknown): value is TravelMode {
  return typeof value === 'string' && (TRAVEL_MODES as readonly string[]).includes(value)
}

/** What to say when a mode has no route for the journey: transit modes name the missing service. */
export function describeNoRoute(mode: TravelMode, busReason: BusNoRouteReason | null = null): string {
  if (mode === 'BUS') {
    return describeBusNoRoute(busReason)
  }
  const info = TRAVEL_MODE_INFO[mode]
  if (info.transit) {
    return `No ${info.label.toLowerCase()} route is available for this journey.`
  }
  return mode === 'FOUR_WHEELER' ? 'No route found between these locations.' : `No ${info.label.toLowerCase()} route found for this journey.`
}
