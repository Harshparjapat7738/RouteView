import type { LocationSelection } from '../../location/types/location.ts'
import { TRAVEL_MODE_INFO, type TravelMode } from '../../route/types/travelMode.ts'
import type { Route } from '../../route/types/route.ts'
import { busRides } from '../../bus/utils/busFormat.ts'

/**
 * What may be written into a shared summary, per source of transit data.
 *
 * Metro (and Train): the journey is Google's route content (lines, stops, times, fare), which may not be stored or
 * redistributed, so none of it is ever shared and there is deliberately no switch for it.
 * Bus: the journey is RouteView's own planner over a static GTFS dataset whose licence terms are not documented in this
 * repository. Route numbers and the number of transfers are shared; stop names stay off until the licence confirms it.
 */
export interface SharePolicy {
  bus: { routeNames: boolean; stopNames: boolean }
}

export const DEFAULT_SHARE_POLICY: SharePolicy = Object.freeze({ bus: Object.freeze({ routeNames: true, stopNames: false }) }) as SharePolicy

export interface ShareEndpoints {
  start: LocationSelection | null
  destination: LocationSelection | null
}

export interface ShareSummaryInput extends ShareEndpoints {
  travelMode: TravelMode
  route: Route | null
  /** The person allowed route details that depend on their current location (only asked when the start is the current location). */
  includeLocationDerived: boolean
  link: string | null
  policy?: SharePolicy
}

export function startsAtCurrentLocation(start: LocationSelection | null): boolean {
  return start?.origin === 'CURRENT_LOCATION'
}

/** True when the start is a real place that can go into a link (never the device position). */
export function shareableOriginId(start: LocationSelection | null): string | null {
  return start !== null && start.origin !== 'CURRENT_LOCATION' && typeof start.placeId === 'string' ? start.placeId : null
}

function oneLine(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The journey details a summary may carry. Empty for Metro/Train, and for a current-location start unless the person agreed. */
export function transitDetailLines(input: Pick<ShareSummaryInput, 'start' | 'travelMode' | 'route' | 'includeLocationDerived' | 'policy'>): string[] {
  const policy = input.policy ?? DEFAULT_SHARE_POLICY
  const bus = input.route?.bus
  if (input.travelMode !== 'BUS' || bus === undefined || !policy.bus.routeNames) return []
  if (startsAtCurrentLocation(input.start) && !input.includeLocationDerived) return []
  const rides = busRides(bus)
  const lines: string[] = []
  const names = rides.map((ride) => oneLine(ride.route?.name ?? '')).filter((name) => name !== '')
  if (names.length > 0) lines.push(`Bus: ${names.join(' → ')}`)
  lines.push(bus.transfers === 0 ? 'Direct' : `${bus.transfers} ${bus.transfers === 1 ? 'transfer' : 'transfers'}`)
  if (policy.bus.stopNames) {
    const sequence = rides
      .map((ride) => (ride.boarding && ride.exit ? `${oneLine(ride.boarding.name)} → ${oneLine(ride.exit.name)}` : ''))
      .filter((leg) => leg !== '')
    if (sequence.length > 0) lines.push(`Stops: ${sequence.join('; ')}`)
  }
  return lines
}

/** The plain-text share. No duration, distance, fare or time: those are Google's or the schedule's and are recalculated. */
export function buildShareSummary(input: ShareSummaryInput): string {
  const lines = ['RouteView journey']
  if (input.start !== null) {
    lines.push(startsAtCurrentLocation(input.start) ? 'From: Current location (position not shared)' : `From: ${oneLine(input.start.name)}`)
  }
  if (input.destination !== null) lines.push(`To: ${oneLine(input.destination.name)}`)
  lines.push(`Travel mode: ${TRAVEL_MODE_INFO[input.travelMode].label}`)
  lines.push(...transitDetailLines(input))
  lines.push('Routes, times and fares are calculated again when the link is opened.')
  if (input.link !== null) lines.push(input.link)
  return lines.join('\n')
}
