import { memo, useEffect, useId, useRef, useState } from 'react'
import type { DetectedArea } from '../types/detectedArea.ts'
import { formatDistance } from '../utils/formatRoute.ts'
import { describeAreaType } from '../utils/describeAreaType.ts'
import './JourneyStops.css'

/** A long journey is collapsed to this many stops (the highlighted or matching stop is always shown). */
export const JOURNEY_STOP_LIMIT = 8

interface JourneyStopsProps {
  areas: readonly DetectedArea[]
  /** The highlighted stop, if any. */
  selectedAreaId: string | null
  /** Called with the area id; called with null when the highlighted stop is clicked again. */
  onSelect: (areaId: string | null) => void
  /** Ids of stops that match the current search; they are marked. */
  matchedAreaIds: ReadonlySet<string>
}

/**
 * The geographical areas of one route, in travel order, as a simple timeline.
 * Geographical areas only: nothing here comes from Google Places.
 */
export const JourneyStops = memo(function JourneyStops({ areas, selectedAreaId, onSelect, matchedAreaIds }: JourneyStopsProps) {
  const list = useRef<HTMLOListElement>(null)
  const [expanded, setExpanded] = useState(false)
  const listId = useId()

  // Stops that must stay visible even when the journey is collapsed.
  const mustShow = areas.reduce(
    (last, area, index) => (area.areaId === selectedAreaId || matchedAreaIds.has(area.areaId) ? index : last),
    -1,
  )
  const collapsible = areas.length > JOURNEY_STOP_LIMIT
  const shownCount = expanded || !collapsible ? areas.length : Math.max(JOURNEY_STOP_LIMIT, mustShow + 1)
  const visible = areas.slice(0, shownCount)

  // A stop chosen elsewhere (for example from a search result) is brought into view.
  useEffect(() => {
    if (selectedAreaId === null) {
      return
    }
    const active = list.current?.querySelector('[data-selected="true"]')
    if (active instanceof HTMLElement && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedAreaId])

  return (
    <section className="journey-stops" aria-label="Areas along this route">
      <h3 className="journey-stops__title">
        Areas along this route <span className="journey-stops__count">({areas.length})</span>
      </h3>
      {areas.length === 0 ? (
        <p className="journey-stops__empty" role="status">
          Route found. No geographical areas were detected for this route.
        </p>
      ) : (
        <ol id={listId} className="journey-stops__list" ref={list}>
          {visible.map((area) => {
            const selected = area.areaId === selectedAreaId
            const matched = matchedAreaIds.has(area.areaId)
            return (
              <li key={area.areaId} className="journey-stops__item" data-selected={selected} data-match={matched}>
                <button
                  type="button"
                  className="journey-stops__button"
                  aria-pressed={selected}
                  onClick={() => onSelect(selected ? null : area.areaId)}
                >
                  <span className="journey-stops__dot" aria-hidden="true" />
                  <span className="journey-stops__name">{area.name}</span>
                  {matched && <span className="journey-stops__match">✓ Matches</span>}
                  <span className="journey-stops__meta">
                    {describeAreaType(area.areaType)}
                    {area.distanceFromStartMeters > 0 && ` · ${formatDistance(area.distanceFromStartMeters)}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {collapsible && (
        <button
          type="button"
          className="journey-stops__toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          disabled={!expanded && shownCount === areas.length}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show fewer stops' : `Show all ${areas.length} stops`}
        </button>
      )}
    </section>
  )
})
