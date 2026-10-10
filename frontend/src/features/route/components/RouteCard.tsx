import type { ReactNode } from 'react'
import { TRAVEL_MODE_ICONS } from './travelModeIcons.ts'
import { TRAVEL_MODE_INFO, type TravelMode } from '../types/travelMode.ts'
import { describeTransfers, describeTransitPath, formatClock } from '../utils/transitSummary.ts'
import type { Route } from '../types/route.ts'
import type { RouteBadges } from '../utils/routeBadges.ts'
import { formatDistance, formatDuration } from '../utils/formatRoute.ts'
import { RouteAccessNote } from '../../accessibility/components/RouteAccessNote.tsx'
import { BusRouteSummary } from '../../bus/components/BusRouteSummary.tsx'
import { MetroRouteSummary } from '../../metro/components/MetroRouteSummary.tsx'
import './RouteCard.css'

interface RouteCardProps {
  route: Route
  /** Position in the currently displayed, passing-area-prioritized list. */
  displayNumber?: number
  /** The mode the route was calculated for. */
  travelMode: TravelMode
  /** The colour this route is drawn with on the map. */
  color: string
  selected: boolean
  badges: RouteBadges
  /** Text such as "Matches Neharpar" when the route passes through the searched area; null otherwise. */
  matchLabel: string | null
  /** The route passes through every searched area. A partial match is labelled but never looks like a full one. */
  matchComplete: boolean
  /** A search is active and this route does not match it: shown, but secondary. */
  secondary: boolean
  passingAreaCovered?: boolean
  onSelect: (routeId: string) => void
  /** An accessibility preference is on: the card says what is known about the route's stations. */
  accessRequested?: boolean
  /** Shown for the selected route only: Share. Kept outside the select button (no nested buttons). */
  actions?: ReactNode
  /** The route's Journey Stops. */
  children?: ReactNode
}

/**
 * One route in the comparison: number, duration, distance, area count and factual badges.
 * Selecting is done through the header button; `children` (the Journey Stops) render below it.
 * Selection is never shown by colour alone: there is a "Selected" label and a pressed state.
 */
export function RouteCard({ route, displayNumber = route.index + 1, travelMode, color, selected, badges, matchLabel, matchComplete, secondary, passingAreaCovered = false, onSelect, accessRequested = false, actions, children }: RouteCardProps) {
  const areaCount = route.detectedAreas.length
  const ModeIcon = TRAVEL_MODE_ICONS[travelMode]
  const transit = route.transit
  const departs = transit ? formatClock(transit.departureTime) : ''
  const arrives = transit ? formatClock(transit.arrivalTime) : ''
  return (
    <div className="route-card" data-selected={selected} data-match={matchLabel !== null && matchComplete} data-partial={matchLabel !== null && !matchComplete} data-passing-match={passingAreaCovered} data-secondary={secondary}>
      <button type="button" className="route-card__header" aria-pressed={selected} onClick={() => onSelect(route.id)}>
        <span className="route-card__swatch" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="route-card__body">
          <span className="route-card__name">Route {displayNumber}</span>
          <span className="route-card__mode" data-route-mode={travelMode}>
            <ModeIcon width={16} height={16} />
            {TRAVEL_MODE_INFO[travelMode].label}
          </span>
          <span className="route-card__badges">
            {selected && <span className="route-card__badge route-card__badge--selected">Selected</span>}
            {badges.fastest && <span className="route-card__badge">Fastest</span>}
            {badges.shortest && <span className="route-card__badge">Shortest</span>}
            {badges.lowestFare === true && <span className="route-card__badge">Lowest fare</span>}
            {badges.fewestTransfers === true && <span className="route-card__badge">Fewest transfers</span>}
            {badges.leastWalking === true && <span className="route-card__badge">Shortest walking</span>}
            {passingAreaCovered && <span className="route-card__badge route-card__badge--match">Covers Passing Area</span>}
            {matchLabel !== null && (
              <span className={`route-card__badge${matchComplete ? ' route-card__badge--match' : ' route-card__badge--partial'}`}>
                {matchComplete && '✓ '}
                {matchLabel}
              </span>
            )}
          </span>
          {route.metro !== undefined && <MetroRouteSummary journey={route.metro} />}
          {route.bus !== undefined && <BusRouteSummary journey={route.bus} />}
          {transit !== undefined && route.metro === undefined && (
            <span className="route-card__transit" data-transit-summary>
              {describeTransfers(transit.transfers)}
              {departs !== '' && arrives !== '' && ` · ${departs}–${arrives}`}
              {describeTransitPath(transit) !== '' && ` · ${describeTransitPath(transit)}`}
            </span>
          )}
          <span className="route-card__meta">
            {areaCount} {areaCount === 1 ? 'area' : 'areas'}
            {route.summary !== '' && ` · via ${route.summary}`}
          </span>
        </span>
        <span className="route-card__figures">
          <span className="route-card__duration">{formatDuration(route.durationSeconds)}</span>
          <span>{formatDistance(route.distanceMeters)}</span>
        </span>
      </button>
      <div className="route-card__access"><RouteAccessNote route={route} requested={accessRequested} /></div>
      {actions !== undefined && <div className="route-card__actions">{actions}</div>}
      {children !== undefined && <div className="route-card__extra">{children}</div>}
    </div>
  )
}
