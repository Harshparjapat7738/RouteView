import { formatDuration } from '../../route/utils/formatRoute.ts'
import type { BusJourney } from '../types/bus.ts'
import {
  busRides,
  describeBusStops,
  describeBusTransfers,
  describeDirection,
  firstBoarding,
  formatBusClock,
  formatBusFare,
  lastExit,
  totalRidingStops,
} from '../utils/busFormat.ts'
import { BusRoutePill } from './BusRoutePill.tsx'
import './Bus.css'

/**
 * The compact bus summary inside a route card: the buses to take, fare (or that it is unavailable), stops, transfers,
 * walking, where to board and where to get off, and the direction. Times are the published schedule - not live.
 */
export function BusRouteSummary({ journey }: { journey: BusJourney }) {
  const rides = busRides(journey)
  const first = rides[0]
  const direction = first === undefined ? null : describeDirection(first)
  const boarding = firstBoarding(journey)
  const exit = lastExit(journey)
  const departs = formatBusClock(journey.departureTime)
  const arrives = formatBusClock(journey.arrivalTime)
  return (
    <span className="bus-summary" data-bus-summary>
      <span className="bus-summary__rides" data-bus-rides>
        {rides.map((ride, index) => (
          <span key={index} className="bus-summary__ride">
            {index > 0 && <span aria-label="then">→</span>}
            <BusRoutePill name={ride.route?.name ?? ''} />
          </span>
        ))}
      </span>
      <span className="bus-summary__facts">
        <span className="bus-summary__fare" data-bus-fare={journey.fare === null ? 'unavailable' : 'known'}>
          {formatBusFare(journey.fare)}
        </span>
        <span>{describeBusTransfers(journey.transfers)}</span>
        <span>{describeBusStops(totalRidingStops(journey))}</span>
        <span>Walk {formatDuration(journey.walkingSeconds)}</span>
      </span>
      {boarding !== null && exit !== null && (
        <span className="bus-summary__path">
          <span className="bus-summary__stop">{boarding}</span> → <span className="bus-summary__stop">{exit}</span>
        </span>
      )}
      {direction !== null && <span data-bus-direction>{direction}</span>}
      <span className="bus-summary__schedule" data-bus-schedule>
        {departs !== '' && arrives !== '' ? `Scheduled ${departs}–${arrives} · not live` : 'Scheduled timetable · not live'}
      </span>
    </span>
  )
}
