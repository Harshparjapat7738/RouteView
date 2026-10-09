import { Fragment } from 'react'
import { formatClock } from '../../route/utils/transitSummary.ts'
import { formatDuration } from '../../route/utils/formatRoute.ts'
import type { MetroJourney } from '../types/metro.ts'
import { boardingStation, describeInterchanges, describeStations, describeStops, exitStation, formatFare, lineLabel } from '../utils/metroFormat.ts'
import { MetroLinePill } from './MetroLinePill.tsx'
import './Metro.css'

/**
 * The compact metro summary inside a route card: fare, interchanges, stations, walking, and where the person
 * boards, which lines they ride and where they leave. Everything is the provider's data; a missing fare says so.
 */
export function MetroRouteSummary({ journey }: { journey: MetroJourney }) {
  const rides = journey.segments.filter((segment) => segment.type === 'METRO' || segment.type === 'TRANSIT')
  const boarding = boardingStation(journey)
  const exit = exitStation(journey)
  const stations = describeStations(journey.stationCount)
  const stops = describeStops(journey.travelledStops)
  const departs = formatClock(journey.departureTime)
  const arrives = formatClock(journey.arrivalTime)
  return (
    <span className="metro-summary" data-metro-summary>
      <span className="metro-summary__facts">
        <span className="metro-summary__fare" data-metro-fare={journey.fare === null ? 'unavailable' : 'known'}>
          {formatFare(journey.fare)}
        </span>
        <span>{describeInterchanges(journey.transfers)}</span>
        {stations !== null && <span>{stations}</span>}
        {stops !== null && <span>{stops}</span>}
        <span>Walk {formatDuration(journey.walkingSeconds)}</span>
        {departs !== '' && arrives !== '' && (
          <span>
            {departs}–{arrives}
          </span>
        )}
      </span>
      {rides.length > 0 && (
        <span className="metro-summary__path" data-metro-path>
          {boarding !== null && <span className="metro-summary__station">{boarding.name}</span>}
          {rides.map((ride, index) => (
            <Fragment key={index}>
              <span className="metro-summary__arrow" aria-label="then">
                →
              </span>
              <MetroLinePill name={lineLabel(ride.line)} color={ride.line?.color ?? null} />
            </Fragment>
          ))}
          {exit !== null && (
            <>
              <span className="metro-summary__arrow" aria-label="to">
                →
              </span>
              <span className="metro-summary__station">{exit.name}</span>
            </>
          )}
        </span>
      )}
    </span>
  )
}
