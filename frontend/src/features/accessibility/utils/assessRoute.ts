import type { Route } from '../../route/types/route.ts'
import { UNKNOWN_ACCESS, type AccessLevel, type AccessPoint, type Accessibility, type RouteAccess } from '../types/accessibility.ts'

const NOT_APPLICABLE: RouteAccess = Object.freeze({ applicable: false, points: [], accessible: 0, inaccessible: 0, unknown: 0, level: 'UNKNOWN' }) as RouteAccess

type Ref = { name: string; accessibility?: Accessibility } & ({ stationId: string | null } | { key: string })

function keyOf(ref: Ref): string {
  if ('key' in ref) return ref.key
  return ref.stationId ?? `name:${ref.name.trim().toLowerCase()}`
}

/**
 * The stations / stops of a route that matter for access, from RouteView's own journey data: where the rider boards, where they
 * leave and where they change. Stations the rider only passes through are not relevant. A station that appears more than once
 * (the exit of one ride, the change, the start of the next) is listed once.
 *
 * Only Metro and Bus journeys have station data; for every other route `applicable` is false and nothing is claimed.
 * Lifts, step-free connections between platforms, vehicles and the walk to a station are NOT part of the data, so a route is
 * never assessed as accessible as a whole.
 */
export function assessRouteAccess(route: Route): RouteAccess {
  const points: AccessPoint[] = []
  const add = (ref: Ref | null | undefined, kind: AccessPoint['kind']) => {
    if (!ref) return
    const key = keyOf(ref)
    const earlier = points.findIndex((point) => point.key === key)
    if (earlier >= 0) {
      // Left one ride and joined the next here: it is a change, whichever step listed it first.
      const known = points[earlier]
      if (known && known.kind !== kind) points[earlier] = { ...known, kind: 'TRANSFER' }
      return
    }
    points.push({ key, name: ref.name, kind, accessibility: ref.accessibility ?? UNKNOWN_ACCESS })
  }
  if (route.metro !== undefined) {
    for (const segment of route.metro.segments) {
      if (segment.type === 'METRO' || segment.type === 'TRANSIT') {
        add(segment.boarding, 'BOARDING')
        add(segment.exit, 'EXIT')
      } else if (segment.type === 'TRANSFER') {
        add(segment.transferStation, 'TRANSFER')
        add(segment.transferToStation, 'TRANSFER')
      }
    }
  } else if (route.bus !== undefined) {
    for (const segment of route.bus.segments) {
      if (segment.type === 'BUS') {
        add(segment.boarding, 'BOARDING')
        add(segment.exit, 'EXIT')
      } else if (segment.type === 'TRANSFER') {
        add(segment.transferStop, 'TRANSFER')
      }
    }
  } else {
    return NOT_APPLICABLE
  }
  if (points.length === 0) return NOT_APPLICABLE
  const accessible = points.filter((point) => point.accessibility.status === 'ACCESSIBLE').length
  const inaccessible = points.filter((point) => point.accessibility.status === 'INACCESSIBLE').length
  const unknown = points.length - accessible - inaccessible
  const level: AccessLevel = inaccessible > 0 ? 'HAS_INACCESSIBLE' : unknown === 0 ? 'ALL_LISTED' : accessible > 0 ? 'PARTIAL' : 'UNKNOWN'
  return { applicable: true, points, accessible, inaccessible, unknown, level }
}
