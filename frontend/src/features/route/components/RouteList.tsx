import { memo, useMemo } from 'react'
import type { Route } from '../types/route.ts'
import type { RouteSession } from '../types/routeSession.ts'
import type { RouteMatch } from '../types/routeMatch.ts'
import type { RouteSessionState } from '../state/routeSessionReducer.ts'
import { describeRouteMatch as describeMatch } from '../utils/describeRouteMatch.ts'
import { computeRouteBadges, type RouteBadges } from '../utils/routeBadges.ts'
import { routeColor } from '../utils/routeColors.ts'
import { JourneyStops } from './JourneyStops.tsx'
import { TransitSteps } from './TransitSteps.tsx'
import { describeNoRoute, type TravelMode } from '../types/travelMode.ts'
import { BusTimeline } from '../../bus/components/BusTimeline.tsx'
import { MetroTimeline } from '../../metro/components/MetroTimeline.tsx'
import { describeAccessibility, describeHidden, describeRanking, describeUnapplied, describeUnverified } from '../../preferences/utils/describePreferences.ts'
import { RouteCard } from './RouteCard.tsx'
import { ShareButton } from '../../share/components/ShareButton.tsx'
import type { LocationSelection } from '../../location/types/location.ts'
import { RouteStopsPreview } from './RouteStopsPreview.tsx'
import { prioritizeRoutesByCoverage } from '../utils/routePointProximity.ts'
import './RouteList.css'

const NO_IDS: ReadonlySet<string> = new Set()
const NOOP = () => {}
const NO_BADGES: RouteBadges = { fastest: false, shortest: false }

interface RouteListProps {
  state: RouteSessionState
  /** True when both a start and a destination are selected. */
  hasLocations: boolean
  onSelect: (routeId: string) => void
  /** Highlights a detected area of the selected route. */
  onAreaSelect: (areaId: string | null) => void
  /** Repeats the failed calculation for the same locations. */
  onRetry?: () => void
  /** Opens the Journey View of the selected route (a different view of the same session). */
  onOpenJourney?: () => void
  /** The active passing-area search, or null when there is none. Routes absent from `matches` match nothing. */
  search?: RouteSearch | null
  /** Route ids whose geometry is within the selected passing area's proximity radius. */
  passingAreaMatches?: ReadonlySet<string>
  /** The selected geocoded passing-area name, or null when no coordinate is selected. */
  passingAreaName?: string | null
  /** Metro: the selected station (shared with the map) and how to change it. */
  selectedStationKey?: string | null
  onSelectStation?: (key: string | null) => void
  /** Name of the destination, for the last line of the metro timeline. */
  destinationName?: string
  /** Opens the Preferences panel (the line about ordering and hidden routes links to it). */
  onOpenPreferences?: () => void
}

export interface RouteSearch {
  matches: ReadonlyMap<string, RouteMatch>
  /** What is searched for, for the summary line. */
  text: string
  /** Number of selected areas; null while the user is only typing. */
  expected: number | null
}

/**
 * Route comparison: one card per calculated route of the Route Session, in the order the routing logic
 * supplied. It only presents session data; selecting, expanding or searching never makes a request.
 */
export function RouteList({
  state,
  hasLocations,
  onSelect,
  onAreaSelect,
  onOpenJourney,
  onRetry,
  search = null,
  passingAreaMatches = NO_IDS,
  passingAreaName = null,
  selectedStationKey = null,
  onSelectStation = NOOP,
  destinationName,
  onOpenPreferences,
}: RouteListProps) {
  const routes = state.status === 'ready' ? state.session.routes : undefined
  const badges = useMemo(() => (routes ? computeRouteBadges(routes) : null), [routes])

  if (state.status === 'none') {
    return (
      <section className="route-list" aria-label="Routes" data-map-overlay="">
        <h2 className="route-list__title">Routes</h2>
        <p className="route-list__message">
          {hasLocations
            ? 'Press Find Routes to compare routes.'
            : 'Select a start and destination to compare routes.'}
        </p>
      </section>
    )
  }

  const searching = search !== null
  const fullMatchCount = search ? [...search.matches.values()].filter((match) => match.complete).length : 0
  const session = state.status === 'ready' ? state.session : null
  const warnings = session ? [...new Set(session.routes.flatMap((route) => route.warnings ?? []))].slice(0, 3) : []

  return (
    <section className="route-list" aria-label="Routes" aria-busy={state.status === 'loading'} data-map-overlay="">
      <h2 className="route-list__title">Routes</h2>
      {state.status === 'loading' && (
        <>
          <p className="route-list__message" role="status">
            Finding routes...
          </p>
          <p className="route-list__hint">The areas each route passes through are detected in the same step.</p>
          <ul className="route-list__skeletons" aria-hidden="true">
            <li className="route-list__skeleton" />
            <li className="route-list__skeleton" />
          </ul>
        </>
      )}
      {state.status === 'error' && (
        <div className="route-list__message route-list__message--error" role="alert">
          <p className="route-list__error-text">{state.message}</p>
          {state.canTryAgain && onRetry !== undefined && (
            <button type="button" className="route-list__retry" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
      {session !== null && session.routes.length === 0 && session.preference?.noMatch === true && (
        <div className="route-list__message" role="status" data-preference-no-match="">
          <p className="route-list__error-text">{describeHidden(session.preference)}</p>
          {onOpenPreferences !== undefined && (
            <button type="button" className="route-list__retry" onClick={onOpenPreferences}>
              Change preferences
            </button>
          )}
        </div>
      )}
      {session !== null && session.routes.length === 0 && session.preference?.noMatch !== true && (
        <p className="route-list__message" role="status" data-no-route={session.travelMode}>
          {describeNoRoute(session.travelMode, session.noRouteReason ?? null)}
          {session.travelMode === 'METRO' && ' There may be no metro station close enough to the start or destination, or no service between them.'}
        </p>
      )}
      {session !== null && session.routes.length > 0 && (
        <>
          <p className="route-list__summary" role="status">
            {searching
              ? `${fullMatchCount} of ${session.routes.length} ${session.routes.length === 1 ? 'route matches' : 'routes match'} “${search.text}”`
              : session.travelMode === 'METRO'
                ? `${session.routes.length} metro ${session.routes.length === 1 ? 'route' : 'routes'} · compare time, fare and transfers`
                : session.travelMode === 'BUS'
                  ? `${session.routes.length} bus ${session.routes.length === 1 ? 'route' : 'routes'} · compare time, transfers and walking`
                  : `${session.routes.length} ${session.routes.length === 1 ? 'route' : 'routes'} · compare time, distance and where each goes`}
          </p>
          {session.preference !== undefined && (
            <PreferenceNotes outcome={session.preference} onOpen={onOpenPreferences} />
          )}
          {onOpenJourney !== undefined && session.selectedRouteId !== null && (
            <button type="button" className="route-list__journey" data-journey-open onClick={onOpenJourney}>
              Open Journey View for Route {(session.routes.find((route) => route.id === session.selectedRouteId)?.index ?? 0) + 1} →
            </button>
          )}
          {warnings.length > 0 && (
            <ul className="route-list__warnings" data-route-warnings>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <ul className="route-list__items">
            {prioritizeRoutesByCoverage(session.routes, passingAreaMatches).map((route, position) => {
              const selected = route.id === session.selectedRouteId
              return (
                <li key={route.id}>
                  <RouteListItem
                    route={route}
                    displayNumber={passingAreaName === null ? route.index + 1 : position + 1}
                    travelMode={session.travelMode}
                    selected={selected}
                    // Only the selected route cares which stop is highlighted; the others keep their props.
                    selectedAreaId={selected ? session.selectedAreaId : null}
                    badges={badges?.get(route.id) ?? NO_BADGES}
                    match={search?.matches.get(route.id)}
                    searching={searching}
                    passingAreaCovered={passingAreaMatches.has(route.id)}
                    onSelect={onSelect}
                    onAreaSelect={onAreaSelect}
                    selectedStationKey={selected ? selectedStationKey : null}
                    onSelectStation={onSelectStation}
                    destinationName={destinationName}
                    accessRequested={session.preference?.accessibility != null}
                    start={selected ? session.startLocation : null}
                    end={selected ? session.destinationLocation : null}
                  />
                </li>
              )
            })}
          </ul>
          {passingAreaName !== null && (
            <p className="route-list__summary" role="status">
              {passingAreaMatches.size > 0
                ? `${passingAreaMatches.size} ${passingAreaMatches.size === 1 ? 'route covers' : 'routes cover'} ${passingAreaName}; matching routes are prioritized.`
                : `No route passes through the specified area: ${passingAreaName}.`}
            </p>
          )}
        </>
      )}
    </section>
  )
}

interface RouteListItemProps {
  route: Route
  displayNumber: number
  travelMode: TravelMode
  selected: boolean
  selectedAreaId: string | null
  badges: RouteBadges
  match: RouteMatch | undefined
  searching: boolean
  passingAreaCovered: boolean
  onSelect: (routeId: string) => void
  onAreaSelect: (areaId: string | null) => void
  selectedStationKey: string | null
  onSelectStation: (key: string | null) => void
  destinationName: string | undefined
  /** The places the session was calculated for; set for the selected route only (it carries the Share action). */
  start: LocationSelection | null
  end: LocationSelection | null
  accessRequested: boolean
}

/**
 * One card with its stops. Memoised: selecting another route, highlighting a stop on the selected route or
 * typing in the search re-renders only the cards whose own props changed.
 */
const RouteListItem = memo(function RouteListItem({
  route,
  displayNumber,
  travelMode,
  selected,
  selectedAreaId,
  badges,
  match,
  searching,
  passingAreaCovered,
  onSelect,
  onAreaSelect,
  selectedStationKey,
  onSelectStation,
  destinationName,
  start,
  end,
  accessRequested,
}: RouteListItemProps) {
  const matchedIds = useMemo(() => (match ? new Set(match.areas.map((area) => area.areaId)) : NO_IDS), [match])
  return (
    <RouteCard
      route={route}
      displayNumber={displayNumber}
      travelMode={travelMode}
      color={routeColor(route.index)}
      selected={selected}
      badges={badges}
      matchLabel={match ? describeMatch(match) : null}
      matchComplete={match?.complete ?? false}
      secondary={searching && match?.complete !== true}
      passingAreaCovered={passingAreaCovered}
      onSelect={onSelect}
      accessRequested={accessRequested}
      actions={selected && end !== null ? <ShareButton route={route} travelMode={travelMode} start={start} destination={end} /> : undefined}
    >
      {selected && route.metro !== undefined && (
        <MetroTimeline journey={route.metro} destinationName={destinationName} selectedStationKey={selectedStationKey} onSelectStation={onSelectStation} />
      )}
      {selected && route.bus !== undefined && (
        <BusTimeline journey={route.bus} destinationName={destinationName} selectedStopKey={selectedStationKey} onSelectStop={onSelectStation} />
      )}
      {selected && route.transit !== undefined && route.metro === undefined && <TransitSteps transit={route.transit} />}
      {selected ? (
        <JourneyStops
          areas={route.detectedAreas}
          selectedAreaId={selectedAreaId}
          onSelect={onAreaSelect}
          matchedAreaIds={matchedIds}
        />
      ) : (
        <RouteStopsPreview areas={route.detectedAreas} matchedAreaIds={matchedIds} />
      )}
    </RouteCard>
  )
})

function PreferenceNotes({ outcome, onOpen }: { outcome: NonNullable<RouteSession['preference']>; onOpen: (() => void) | undefined }) {
  const lines = [describeRanking(outcome), describeHidden(outcome), ...describeUnapplied(outcome), ...describeAccessibility(outcome), describeUnverified(outcome)].filter((line): line is string => line !== null)
  if (lines.length === 0) return null
  return (
    <div className="route-list__preference" data-preference-notes="">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {onOpen !== undefined && (
        <button type="button" className="route-list__preference-link" onClick={onOpen}>
          Preferences
        </button>
      )}
    </div>
  )
}
