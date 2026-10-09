import { useState } from 'react'
import { formatDistance, formatDuration } from '../../route/utils/formatRoute.ts'
import { formatClock, vehicleLabel } from '../../route/utils/transitSummary.ts'
import type { MetroJourney, MetroSegment, MetroStationRef } from '../types/metro.ts'
import { describeDataset, describeStation, describeStops, formatFare, lineLabel, stationKey } from '../utils/metroFormat.ts'
import { MetroLinePill } from './MetroLinePill.tsx'
import './Metro.css'

interface MetroTimelineProps {
  journey: MetroJourney
  destinationName?: string
  selectedStationKey: string | null
  onSelectStation: (key: string | null) => void
}

/**
 * The metro journey as a timeline: first-mile walk, each metro ride (line, direction, boarding, stations, exit),
 * interchanges, last-mile walk and the destination. Walking, riding, interchange and destination look different.
 * Stations are listed only when the sequence was verified against the dataset; otherwise only boarding and exit.
 */
export function MetroTimeline({ journey, destinationName, selectedStationKey, onSelectStation }: MetroTimelineProps) {
  // Static data older than a year is flagged; the clock is read once per mount.
  const [now] = useState(() => Date.now())
  const segments = journey.segments
  return (
    <section className="metro-timeline" aria-label="Metro journey" data-metro-timeline>
      <p className="metro-timeline__fare" data-metro-fare-line>
        {journey.fare === null ? 'Metro fare information is currently unavailable.' : `Metro fare: ${formatFare(journey.fare)}`}
      </p>
      <ol className="metro-timeline__list">
        {segments.map((segment, index) => (
          <li key={index} className="metro-step" data-kind={stepKind(segment)}>
            <span className="metro-step__marker" aria-hidden="true" />
            <div className="metro-step__body">
              {renderSegment(segment, segments[index + 1], selectedStationKey, onSelectStation)}
            </div>
          </li>
        ))}
        <li className="metro-step" data-kind="destination">
          <span className="metro-step__marker" aria-hidden="true" />
          <div className="metro-step__body">
            <p className="metro-step__title">{destinationName ? `Arrive at ${destinationName}` : 'Arrive at destination'}</p>
          </div>
        </li>
      </ol>
      {journey.notices.length > 0 && (
        <ul className="metro-timeline__notices" data-metro-notices>
          {journey.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      )}
      <p className="metro-timeline__dataset" data-metro-dataset>
        {describeDataset(journey.dataset, now)}
      </p>
    </section>
  )
}

function stepKind(segment: MetroSegment): string {
  switch (segment.type) {
    case 'WALK':
      return 'walk'
    case 'METRO':
      return 'metro'
    case 'TRANSFER':
      return 'interchange'
    default:
      return 'transit'
  }
}

function StationButton({ station, selectedStationKey, onSelect, children }: { station: MetroStationRef; selectedStationKey: string | null; onSelect: (key: string | null) => void; children?: string }) {
  const key = stationKey(station)
  const selected = selectedStationKey === key
  return (
    <button
      type="button"
      className="metro-station-button"
      aria-pressed={selected}
      aria-label={describeStation(station)}
      data-station-key={key}
      data-role={station.role}
      onClick={() => onSelect(selected ? null : key)}
    >
      {children ?? station.name}
    </button>
  )
}

function renderSegment(
  segment: MetroSegment,
  next: MetroSegment | undefined,
  selectedStationKey: string | null,
  onSelect: (key: string | null) => void,
) {
  if (segment.type === 'WALK') {
    const target = next?.boarding
    const lastMile = segment.walkRole === 'LAST_MILE'
    return (
      <>
        <p className="metro-step__title">
          {lastMile ? 'Walk to your destination' : target ? 'Walk to ' : 'Walk'}
          {!lastMile && target && <StationButton station={target} selectedStationKey={selectedStationKey} onSelect={onSelect} />}
        </p>
        <p className="metro-step__detail">
          {formatDistance(segment.distanceMeters)} · {formatDuration(segment.durationSeconds)}
        </p>
      </>
    )
  }
  if (segment.type === 'TRANSFER') {
    const station = segment.transferStation
    return (
      <>
        <p className="metro-step__title">
          Change at {station ? <StationButton station={station} selectedStationKey={selectedStationKey} onSelect={onSelect} /> : 'the interchange'}
        </p>
        {(segment.fromLine || segment.toLine) && (
          <p className="metro-step__detail metro-step__change">
            {segment.fromLine && <MetroLinePill name={lineLabel(segment.fromLine)} color={segment.fromLine.color} />}
            <span aria-label="to">→</span>
            {segment.toLine && <MetroLinePill name={lineLabel(segment.toLine)} color={segment.toLine.color} />}
          </p>
        )}
        {segment.transferToStation && (
          <p className="metro-step__detail">
            Continue from <StationButton station={segment.transferToStation} selectedStationKey={selectedStationKey} onSelect={onSelect} />
          </p>
        )}
        {segment.transferWalkMeters !== null && segment.transferWalkSeconds !== null && (
          <p className="metro-step__detail">
            Walk {formatDistance(segment.transferWalkMeters)} · {formatDuration(segment.transferWalkSeconds)}
          </p>
        )}
      </>
    )
  }
  return <RideStep segment={segment} selectedStationKey={selectedStationKey} onSelect={onSelect} />
}

function RideStep({ segment, selectedStationKey, onSelect }: { segment: MetroSegment; selectedStationKey: string | null; onSelect: (key: string | null) => void }) {
  const metro = segment.type === 'METRO'
  const stops = describeStops(segment.stopCount > 0 ? segment.stopCount : null)
  const departs = formatClock(segment.departureTime)
  const arrives = formatClock(segment.arrivalTime)
  const between = segment.intermediateStations
  return (
    <>
      <p className="metro-step__title">
        <MetroLinePill name={metro ? lineLabel(segment.line) : segment.line?.name || vehicleLabel(segment.line?.vehicleType ?? '')} color={segment.line?.color ?? null} />
        {!metro && <span className="metro-step__other"> (not metro)</span>}
      </p>
      {segment.towards !== null && segment.towards !== '' ? (
        <p className="metro-step__detail">Towards {segment.towards}</p>
      ) : (
        metro && <p className="metro-step__detail metro-step__detail--muted">Direction unavailable</p>
      )}
      {segment.boarding && (
        <p className="metro-step__detail">
          Board at <StationButton station={segment.boarding} selectedStationKey={selectedStationKey} onSelect={onSelect} />
          {departs !== '' && ` · ${departs}`}
        </p>
      )}
      <p className="metro-step__detail">
        {[stops, formatDuration(segment.durationSeconds)].filter((part) => part !== null).join(' · ')}
      </p>
      {between !== null && between.length > 0 && (
        <details className="metro-step__stations">
          <summary>Stations on the way ({between.length})</summary>
          <ol className="metro-step__station-list">
            {between.map((station) => (
              <li key={stationKey(station)} data-role={station.role}>
                <StationButton station={station} selectedStationKey={selectedStationKey} onSelect={onSelect} />
                {station.role === 'INTERCHANGE' && <span className="metro-step__tag"> Interchange</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
      {segment.exit && (
        <p className="metro-step__detail">
          {metro ? 'Get off at ' : 'Leave at '}
          <StationButton station={segment.exit} selectedStationKey={selectedStationKey} onSelect={onSelect} />
          {arrives !== '' && ` · ${arrives}`}
        </p>
      )}
    </>
  )
}
