import type { BusJourney, BusNoRouteReason, BusSegment } from '../types/bus.ts'

export function describeBusTransfers(transfers: number): string {
  return transfers === 0 ? 'Direct' : `${transfers} ${transfers === 1 ? 'transfer' : 'transfers'}`
}

export function describeBusStops(count: number): string {
  return `${count} ${count === 1 ? 'stop' : 'stops'}`
}

/** A fare is never estimated: without a reliable source the journey says so. */
export function formatBusFare(fare: BusJourney['fare']): string {
  return fare === null ? 'Fare unavailable' : `${fare.currency} ${fare.amount}`
}

export function busRides(journey: BusJourney): BusSegment[] {
  return journey.segments.filter((segment) => segment.type === 'BUS')
}

/** "216DOWN → 171UP": the routes in riding order. */
export function busRouteChain(journey: BusJourney): string {
  return busRides(journey)
    .map((ride) => ride.route?.name ?? '')
    .filter((name) => name !== '')
    .join(' → ')
}

/** "Towards Kashmere Gate", or null when neither the dataset nor the ride's last stop gives a direction. Never invented. */
export function describeDirection(ride: BusSegment): string | null {
  return ride.headsign === null ? null : `Towards ${ride.headsign}`
}

/** "Walk → Bus → Transfer → Bus → Walk": the shape of the journey in words. */
export function describeJourneyShape(journey: BusJourney): string {
  return journey.segments
    .map((segment) => (segment.type === 'WALK' ? 'Walk' : segment.type === 'BUS' ? 'Bus' : 'Transfer'))
    .join(' → ')
}

/** Plain-language reason for an empty bus answer. Nothing is guessed: an unknown reason gets the general message. */
export function describeBusNoRoute(reason: BusNoRouteReason | null): string {
  switch (reason) {
    case 'NO_BUS_DATA':
      return 'Bus information is not available right now. Please try again later.'
    case 'NO_STOP_NEAR_START':
      return 'No bus stop with service was found near your start.'
    case 'NO_STOP_NEAR_DESTINATION':
      return 'No bus stop with service was found near your destination.'
    case 'NO_SERVICE':
      return 'No scheduled bus service was found for this time. Try another time or day.'
    default:
      return 'No bus route was found between these places.'
  }
}

const DELHI_ZONE = 'Asia/Kolkata'

/** "08:05" in Delhi time (the schedule's own time zone, whatever zone the device is in); empty for a missing or invalid time. */
export function formatBusClock(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: DELHI_ZONE })
}

/** Stops ridden on one bus: the stops after boarding, up to and including the exit (the stop-to-stop hops). */
export function ridingStops(ride: BusSegment): number {
  return ride.stopToStopSegments
}

/** Stops ridden over the whole journey; the card's "N stops". */
export function totalRidingStops(journey: BusJourney): number {
  return busRides(journey).reduce((sum, ride) => sum + ridingStops(ride), 0)
}

/** The stop the rider first boards and the stop they finally leave, for the card. */
export function firstBoarding(journey: BusJourney): string | null {
  return busRides(journey)[0]?.boarding?.name ?? null
}

export function lastExit(journey: BusJourney): string | null {
  const rides = busRides(journey)
  return rides[rides.length - 1]?.exit?.name ?? null
}
