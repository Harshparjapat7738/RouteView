import { memo, useEffect, useRef } from 'react'
import { describeAreaType } from '../../route/utils/describeAreaType.ts'
import { formatDistance } from '../../route/utils/formatRoute.ts'
import type { Journey, JourneyStopView } from '../utils/buildJourney.ts'
import './JourneyView.css'

interface JourneyTimelineProps {
  journey: Journey
  /** Highlights a stop; called with null when the highlighted stop is chosen again. */
  onSelectStop: (areaId: string | null) => void
}

/**
 * Start → detected geographical areas → Destination, in travel order. Start and destination are the journey's
 * ends, visually distinct from the Journey Stops. Choosing a stop only highlights it (and its place on the map):
 * the route stays selected and nothing is requested.
 */
export const JourneyTimeline = memo(function JourneyTimeline({ journey, onSelectStop }: JourneyTimelineProps) {
  const list = useRef<HTMLOListElement>(null)
  const selectedId = journey.stops.find((stop) => stop.selected)?.areaId ?? null

  useEffect(() => {
    if (selectedId === null) {
      return
    }
    const active = list.current?.querySelector('[data-selected="true"]')
    if (active instanceof HTMLElement && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedId])

  return (
    <section className="journey-timeline" aria-label="Journey timeline">
      <ol className="journey-timeline__list" ref={list}>
        <li className="journey-timeline__end journey-timeline__end--start">
          <span className="journey-timeline__marker" aria-hidden="true" />
          <span className="journey-timeline__end-label">Start</span>
          <span className="journey-timeline__end-name">{journey.startName}</span>
        </li>
        {journey.stops.length === 0 && (
          <li className="journey-timeline__empty" role="status">
            No geographical areas detected along this route.
          </li>
        )}
        {journey.stops.map((stop, index) => (
          <JourneyStop key={stop.areaId} stop={stop} index={index} total={journey.stops.length} onSelect={onSelectStop} />
        ))}
        <li className="journey-timeline__end journey-timeline__end--destination">
          <span className="journey-timeline__marker" aria-hidden="true" />
          <span className="journey-timeline__end-label">Destination</span>
          <span className="journey-timeline__end-name">{journey.destinationName}</span>
        </li>
      </ol>
    </section>
  )
})

interface JourneyStopProps {
  stop: JourneyStopView
  index: number
  total: number
  onSelect: (areaId: string | null) => void
}

function JourneyStop({ stop, index, total, onSelect }: JourneyStopProps) {
  const type = describeAreaType(stop.areaType)
  const label = [
    `Stop ${index + 1} of ${total}: ${stop.name}`,
    type,
    stop.matched ? 'matches your search' : null,
    stop.selected ? 'highlighted on the map' : null,
  ]
    .filter((part) => part !== null)
    .join(', ')

  return (
    <li className="journey-timeline__stop" data-selected={stop.selected} data-match={stop.matched}>
      <button
        type="button"
        className="journey-timeline__button"
        aria-pressed={stop.selected}
        aria-label={label}
        onClick={() => onSelect(stop.selected ? null : stop.areaId)}
      >
        <span className="journey-timeline__marker" aria-hidden="true" />
        <span className="journey-timeline__name">
          
          {stop.name}
        </span>
        {stop.selected && <span className="journey-timeline__tag" aria-hidden="true">On map</span>}
        {stop.matched && !stop.selected && <span className="journey-timeline__tag journey-timeline__tag--match" aria-hidden="true">Match</span>}
        <span className="journey-timeline__meta">
          {type}
          {stop.distanceFromStartMeters > 0 && ` · ${formatDistance(stop.distanceFromStartMeters)} from start`}
          {stop.position > 0 && ` · ${Math.round(stop.position * 100)}% of the way`}
        </span>
      </button>
    </li>
  )
}
