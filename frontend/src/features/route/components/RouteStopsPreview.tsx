import { memo, useId, useState } from 'react'
import type { DetectedArea } from '../types/detectedArea.ts'
import './RouteStopsPreview.css'

/** How many stops a route that is not selected shows before the rest is collapsed. */
export const PREVIEW_STOP_LIMIT = 4

interface RouteStopsPreviewProps {
  areas: readonly DetectedArea[]
  /** Ids of stops that match the current search; they are marked. */
  matchedAreaIds: ReadonlySet<string>
}

/**
 * The journey of a route that is not selected, so routes can be compared by where they go:
 * "A → B → C → D", then "+N more" that expands to the complete list. Nothing is removed, only collapsed.
 * Expanding is local to the card: it changes no selection and makes no request.
 */
export const RouteStopsPreview = memo(function RouteStopsPreview({ areas, matchedAreaIds }: RouteStopsPreviewProps) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()

  if (areas.length === 0) {
    return <p className="route-stops-preview__empty">No geographical areas were detected for this route.</p>
  }

  const hidden = areas.length - PREVIEW_STOP_LIMIT
  const collapsible = hidden > 0
  // A matching stop is never hidden behind "more".
  const lastMatch = areas.reduce((last, area, index) => (matchedAreaIds.has(area.areaId) ? index : last), -1)
  const shown = expanded || !collapsible ? areas.length : Math.max(PREVIEW_STOP_LIMIT, lastMatch + 1)

  return (
    <div className="route-stops-preview">
      {expanded ? (
        <ol id={listId} className="route-stops-preview__list" aria-label="Journey Stops">
          {areas.map((area) => (
            <li key={area.areaId} data-match={matchedAreaIds.has(area.areaId)}>
              {area.name}
              {matchedAreaIds.has(area.areaId) && <span className="route-stops-preview__match"> ✓ Matches</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p id={listId} className="route-stops-preview__line">
          <strong>Via: </strong>
          {areas.slice(0, shown).map((area, index) => (
            <span key={area.areaId}>
              {index > 0 && ' → '}
              {matchedAreaIds.has(area.areaId) ? <strong>{area.name} ✓</strong> : area.name}
            </span>
          ))}
          {shown < areas.length && ' → …'}
        </p>
      )}
      {collapsible && (shown < areas.length || expanded) && (
        <button
          type="button"
          className="route-stops-preview__toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show fewer stops' : `Show all ${areas.length} stops`}
        </button>
      )}
    </div>
  )
})
