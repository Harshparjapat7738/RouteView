import type { LatLng } from '../../../types/geo.ts'
import type { BusJourney, BusStop, BusStopRole } from '../types/bus.ts'

export type MapBusStopRole = 'network' | 'journey' | 'boarding' | 'transfer' | 'exit'

/** A bus stop drawn on the map: a stop of the network layer or a stop of the selected journey. */
export interface MapBusStop {
  key: string
  name: string
  position: LatLng
  role: MapBusStopRole
}

/** One part of the selected journey as the map draws it: a bus ride (solid) or a walk (dashed). */
export interface MapBusPart {
  key: string
  kind: 'bus' | 'walk'
  path: readonly LatLng[]
  /** Route number for a bus ride; used as an accessible/tooltip name. */
  label: string
}

/** Zoom levels: the stops of the Bus layer appear only when the map is close; ride stops appear a little earlier than their names. */
export const NETWORK_STOP_MIN_ZOOM = 16
export const JOURNEY_STOP_MIN_ZOOM = 14
export const STOP_LABEL_MIN_ZOOM = 16

const ROLE: Record<BusStopRole, MapBusStopRole> = {
  BOARDING: 'boarding',
  INTERMEDIATE: 'journey',
  TRANSFER: 'transfer',
  EXIT: 'exit',
}

export function toMapStop(stop: BusStop): MapBusStop {
  return { key: stop.key, name: stop.name, position: { lat: stop.latitude, lng: stop.longitude }, role: ROLE[stop.role] }
}

/**
 * The stops of the selected journey, each once, in travel order. A stop that is both the exit of one ride and the
 * boarding of the next is a transfer stop and keeps the transfer role.
 */
export function journeyBusStops(journey: BusJourney | undefined): MapBusStop[] {
  if (journey === undefined) return []
  const byKey = new Map<string, MapBusStop>()
  const add = (stop: BusStop) => {
    const mapped = toMapStop(stop)
    const existing = byKey.get(mapped.key)
    if (existing === undefined) {
      byKey.set(mapped.key, mapped)
    } else if (existing.role === 'journey' || (mapped.role === 'transfer' && existing.role !== 'transfer')) {
      byKey.set(mapped.key, { ...existing, role: mapped.role })
    }
  }
  const source = journey.stops.length > 0 ? journey.stops : journey.segments.flatMap((segment) => segment.stops)
  source.forEach(add)
  for (const segment of journey.segments) {
    if (segment.transferStop !== null) add(segment.transferStop)
  }
  return [...byKey.values()]
}

/** The journey's drawable parts, in order. A part without geometry is left out (never replaced by a straight guess). */
export function journeyBusParts(journey: BusJourney | undefined): MapBusPart[] {
  if (journey === undefined) return []
  return journey.segments.flatMap((segment, index) => {
    if (segment.type === 'TRANSFER' || segment.path.length < 2) return []
    return [
      {
        key: `${index}:${segment.type}`,
        kind: segment.type === 'BUS' ? ('bus' as const) : ('walk' as const),
        path: segment.path,
        label: segment.route?.name ?? 'Walk',
      },
    ]
  })
}

/** Which journey stops are drawn at this zoom: the ones that matter always, the stops in between once the map is close. */
export function visibleJourneyStop(stop: Pick<MapBusStop, 'role'>, zoom: number, selected: boolean): boolean {
  return stop.role !== 'journey' || selected || zoom >= JOURNEY_STOP_MIN_ZOOM
}

/** The bus stops of a network window that the journey does not already draw. */
export function networkOnly(stops: readonly MapBusStop[], journeyKeys: ReadonlySet<string>): MapBusStop[] {
  return stops.filter((stop) => !journeyKeys.has(stop.key))
}
