import { useState } from 'react'
import { formatDistance, formatDuration } from '../../route/utils/formatRoute.ts'
import type { BusJourney, BusSegment, BusStop } from '../types/bus.ts'
import {
  describeBusStops,
  describeDirection,
  formatBusClock,
  formatBusFare,
  ridingStops,
} from '../utils/busFormat.ts'
import { BusRoutePill } from './BusRoutePill.tsx'
import './Bus.css'

interface BusTimelineProps {
  journey: BusJourney
  destinationName?: string
  selectedStopKey: string | null
  onSelectStop: (key: string | null) => void
}

/**
 * The bus journey as a timeline: walk to the first stop, each bus (route number, direction, boarding, stops, exit), the
 * change between buses, the final walk and the destination. Walking, bus, transfer and destination look different, and the
 * stops of a ride are listed (collapsed) in their real order. Everything shown comes from the journey: nothing is guessed.
 */
export function BusTimeline({ journey, destinationName, selectedStopKey, onSelectStop }: BusTimelineProps) {
  const segments = journey.segments
  return (
    <section className="bus-timeline" aria-label="Bus journey" data-bus-timeline>
      <p className="bus-timeline__fare" data-bus-fare-line>
        {journey.fare === null ? 'Fare unavailable' : `Fare: ${formatBusFare(journey.fare)}`}
      </p>
      <ol className="bus-timeline__list">
        {segments.map((segment, index) => (
          <li key={index} className="bus-step" data-kind={segment.type.toLowerCase()}>
            <span className="bus-step__marker" aria-hidden="true" />
            <div className="bus-step__body">
              <Segment segment={segment} next={segments[index + 1]} selectedStopKey={selectedStopKey} onSelectStop={onSelectStop} />
            </div>
          </li>
        ))}
        <li className="bus-step" data-kind="destination">
          <span className="bus-step__marker" aria-hidden="true" />
          <div className="bus-step__body">
            <p className="bus-step__title">{destinationName ? `Arrive at ${destinationName}` : 'Arrive at destination'}</p>
            {formatBusClock(journey.arrivalTime) !== '' && <p className="bus-step__detail">Scheduled {formatBusClock(journey.arrivalTime)}</p>}
          </div>
        </li>
      </ol>
      {journey.notices.length > 0 && (
        <ul className="bus-timeline__notices" data-bus-notices>
          {journey.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      )}
      <p className="bus-timeline__dataset" data-bus-dataset>
        Scheduled timetable, not live arrival times{journey.datasetVersion !== null ? ` · data ${journey.datasetVersion}` : ''}
      </p>
    </section>
  )
}

function StopButton({ stop, selectedStopKey, onSelect, children }: { stop: BusStop; selectedStopKey: string | null; onSelect: (key: string | null) => void; children?: string }) {
  const selected = selectedStopKey === stop.key
  return (
    <button
      type="button"
      className="bus-stop-button"
      aria-pressed={selected}
      aria-label={`${stop.name}, show on map`}
      data-stop-key={stop.key}
      data-role={stop.role}
      onClick={() => onSelect(selected ? null : stop.key)}
    >
      {children ?? stop.name}
    </button>
  )
}

function Segment({ segment, next, selectedStopKey, onSelectStop }: { segment: BusSegment; next: BusSegment | undefined; selectedStopKey: string | null; onSelectStop: (key: string | null) => void }) {
  if (segment.type === 'WALK') {
    const lastMile = segment.walkRole === 'LAST_MILE'
    const target = next?.boarding ?? null
    return (
      <>
        <p className="bus-step__title">
          {lastMile ? 'Walk to your destination' : target ? 'Walk to ' : 'Walk'}
          {!lastMile && target && <StopButton stop={target} selectedStopKey={selectedStopKey} onSelect={onSelectStop} />}
        </p>
        <p className="bus-step__detail">
          {formatDistance(segment.distanceMeters)} · {formatDuration(segment.durationSeconds)}
          {segment.estimated && ' (estimate)'}
        </p>
      </>
    )
  }
  if (segment.type === 'TRANSFER') {
    return (
      <>
        <p className="bus-step__title">
          Change buses
          {segment.transferStop !== null && (
            <>
              {' at '}
              <StopButton stop={segment.transferStop} selectedStopKey={selectedStopKey} onSelect={onSelectStop} />
            </>
          )}
        </p>
        {(segment.fromRoute !== null || segment.toRoute !== null) && (
          <p className="bus-step__detail bus-step__change">
            {segment.fromRoute !== null && <BusRoutePill name={segment.fromRoute.name} />}
            <span aria-label="to">→</span>
            {segment.toRoute !== null && <BusRoutePill name={segment.toRoute.name} />}
          </p>
        )}
        {segment.distanceMeters > 0 && (
          <p className="bus-step__detail">
            Walk {formatDistance(segment.distanceMeters)} · {formatDuration(segment.durationSeconds)}
          </p>
        )}
      </>
    )
  }
  return <RideStep ride={segment} selectedStopKey={selectedStopKey} onSelectStop={onSelectStop} />
}

function RideStep({ ride, selectedStopKey, onSelectStop }: { ride: BusSegment; selectedStopKey: string | null; onSelectStop: (key: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const direction = describeDirection(ride)
  const departs = formatBusClock(ride.departureTime)
  const arrives = formatBusClock(ride.arrivalTime)
  const between = ride.stops.slice(1, -1)
  return (
    <>
      <p className="bus-step__title">
        Bus <BusRoutePill name={ride.route?.name ?? ''} />
      </p>
      {direction !== null ? (
        <p className="bus-step__detail">
          {direction}
          {ride.headsignIsTerminal && ' (last stop of this route)'}
        </p>
      ) : (
        <p className="bus-step__detail bus-step__detail--muted">Direction unavailable</p>
      )}
      {ride.boarding && (
        <p className="bus-step__detail">
          Board at <StopButton stop={ride.boarding} selectedStopKey={selectedStopKey} onSelect={onSelectStop} />
          {departs !== '' && ` · ${departs}`}
          {ride.waitSeconds >= 60 && ` · wait about ${formatDuration(ride.waitSeconds)}`}
        </p>
      )}
      <p className="bus-step__detail">
        {describeBusStops(ridingStops(ride))} · {formatDuration(ride.durationSeconds)}
      </p>
      {between.length > 0 && (
        <details className="bus-step__stops" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary>
            {between.length === 1 ? '1 stop on the way' : `${between.length} stops on the way`}
          </summary>
          <ol className="bus-step__stop-list">
            {between.map((stop) => (
              <li key={stop.key} data-role={stop.role}>
                <StopButton stop={stop} selectedStopKey={selectedStopKey} onSelect={onSelectStop} />
              </li>
            ))}
          </ol>
        </details>
      )}
      {ride.exit && (
        <p className="bus-step__detail">
          Get off at <StopButton stop={ride.exit} selectedStopKey={selectedStopKey} onSelect={onSelectStop} />
          {arrives !== '' && ` · ${arrives}`}
        </p>
      )}
    </>
  )
}
