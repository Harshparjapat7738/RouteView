import type { RouteBadges } from '../../route/utils/routeBadges.ts'
import { formatDistance, formatDuration } from '../../route/utils/formatRoute.ts'
import type { BusJourney } from '../../bus/types/bus.ts'
import { busRouteChain, describeBusStops, describeBusTransfers, formatBusFare, totalRidingStops } from '../../bus/utils/busFormat.ts'
import type { MetroJourney } from '../../metro/types/metro.ts'
import { describeInterchanges, describeStations, formatFare } from '../../metro/utils/metroFormat.ts'
import { CheckIcon } from '../../../ui/Icons.tsx'
import './JourneyView.css'

interface JourneyHeaderProps {
  routeNumber: number
  durationSeconds: number
  distanceMeters: number
  selected: boolean
  badges: RouteBadges
  /** How the route relates to the active search ("Matches all 2 selected areas"), or null without a search. */
  matchLabel: string | null
  /** The route passes through every searched area; a partial or missing match never looks like a full one. */
  matchComplete: boolean
  /** Metro journeys: fare, interchanges and stations replace the distance-based summary. */
  metro?: MetroJourney
  /** Bus journeys: route numbers, fare status, transfers and stops replace the distance-based summary. */
  bus?: BusJourney
}

/** Summary of the route shown in the Journey View: number, duration, distance and factual badges. */
export function JourneyHeader({
  routeNumber,
  durationSeconds,
  distanceMeters,
  selected,
  badges,
  matchLabel,
  matchComplete,
  metro,
  bus,
}: JourneyHeaderProps) {
  return (
    <header className="journey-header">
      <h2 className="journey-header__title">Route {routeNumber}</h2>
      <p className="journey-header__figures">
        <span className="journey-header__duration">{formatDuration(durationSeconds)}</span>
        {bus !== undefined
          ? ` · ${busRouteChain(bus)} · ${formatBusFare(bus.fare)} · ${describeBusTransfers(bus.transfers)} · ${describeBusStops(totalRidingStops(bus))} · Walk ${formatDuration(bus.walkingSeconds)}`
          : metro === undefined
          ? ` · ${formatDistance(distanceMeters)}`
          : ` · ${formatFare(metro.fare)} · ${describeInterchanges(metro.transfers)}${describeStations(metro.stationCount) ? ` · ${describeStations(metro.stationCount)}` : ''} · Walk ${formatDuration(metro.walkingSeconds)}`}
      </p>
      <p className="journey-header__badges">
        {selected && <span className="journey-badge journey-badge--selected">Selected</span>}
        {badges.fastest && <span className="journey-badge">Fastest</span>}
        {badges.shortest && <span className="journey-badge">Shortest</span>}
        {badges.lowestFare === true && <span className="journey-badge">Lowest fare</span>}
        {badges.fewestTransfers === true && <span className="journey-badge">Fewest transfers</span>}
        {badges.leastWalking === true && <span className="journey-badge">Shortest walking</span>}
        {matchLabel !== null && (
          <span className={`journey-badge ${matchComplete ? 'journey-badge--match' : 'journey-badge--muted'}`}>
            {matchComplete && <CheckIcon width={12} height={12} />}
            {matchLabel}
          </span>
        )}
      </p>
    </header>
  )
}
