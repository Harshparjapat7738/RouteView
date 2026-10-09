import { memo, useMemo } from 'react'
import type { RouteMatch } from '../../route/types/routeMatch.ts'
import type { RouteSessionState } from '../../route/state/routeSessionReducer.ts'
import { describeRouteMatch } from '../../route/utils/describeRouteMatch.ts'
import { computeRouteBadges } from '../../route/utils/routeBadges.ts'
import { buildJourney } from '../utils/buildJourney.ts'
import { JourneyHeader } from './JourneyHeader.tsx'
import { JourneyTimeline } from './JourneyTimeline.tsx'
import { RouteSwitcher } from './RouteSwitcher.tsx'
import { BusTimeline } from '../../bus/components/BusTimeline.tsx'
import { MetroTimeline } from '../../metro/components/MetroTimeline.tsx'
import { AccessibilityDetails } from '../../accessibility/components/AccessibilityDetails.tsx'
import { ShareButton } from '../../share/components/ShareButton.tsx'
import { SaveOfflineControl } from '../../offline/components/SaveOfflineControl.tsx'
import type { OfflineJourneysApi } from '../../offline/hooks/useOfflineJourneys.ts'
import type { TravelPreferences } from '../../preferences/types/preferences.ts'
import { ArrowLeftIcon } from '../../../ui/Icons.tsx'
import './JourneyView.css'

interface JourneyViewProps {
  state: RouteSessionState
  /** The active search (by route), or null without one. */
  search: { matches: ReadonlyMap<string, RouteMatch>; expected: number | null } | null
  onSelectRoute: (routeId: string) => void
  onSelectArea: (areaId: string | null) => void
  /** Returns to the route comparison. */
  onBack: () => void
  /** Metro: the selected station (shared with the map). */
  selectedStationKey?: string | null
  onSelectStation?: (key: string | null) => void
  /** Saving for offline use; without it the Journey View has no save control. */
  offline?: OfflineJourneysApi
  preferences?: TravelPreferences
}

const NO_IDS: ReadonlySet<string> = new Set()
const NOOP = () => {}

/**
 * A focused view of the selected route of the Route Session: summary, route switcher and the journey from
 * start to destination. It renders two blocks (summary on top, timeline below) so that on a narrow screen the
 * map can sit between them. Everything comes from the session; nothing is calculated or requested here.
 */
export const JourneyView = memo(function JourneyView({ state, search, onSelectRoute, onSelectArea, onBack, selectedStationKey = null, onSelectStation = NOOP, offline, preferences }: JourneyViewProps) {
  const session = state.status === 'ready' ? state.session : null
  const route = session?.routes.find((candidate) => candidate.id === session.selectedRouteId) ?? null
  const routes = session?.routes
  const badges = useMemo(() => (routes ? computeRouteBadges(routes) : null), [routes])
  const match = route ? search?.matches.get(route.id) : undefined
  const matchedIds = useMemo(() => (match ? new Set(match.areas.map((area) => area.areaId)) : NO_IDS), [match])
  const journey = useMemo(
    () => (session && route ? buildJourney(session, route, matchedIds, session.selectedAreaId) : null),
    [session, route, matchedIds],
  )

  const back = (
    <button type="button" className="journey-view__back" onClick={onBack}>
      <ArrowLeftIcon width={18} height={18} /> Compare Routes
    </button>
  )

  if (session === null || route === null || journey === null) {
    return (
      <div className="journey-view" data-map-overlay="">
      <div className="journey-view__top">
        {back}
        <p className={`journey-view__message${state.status === 'error' ? ' journey-view__message--error' : ''}`} role={state.status === 'error' ? 'alert' : 'status'}>
          {describeUnavailable(state.status, session !== null)}
        </p>
      </div>
      </div>
    )
  }

  const matchLabel = match ? describeRouteMatch(match) : search?.expected != null ? 'Does not match the selected areas' : null

  return (
    <div className="journey-view" data-map-overlay="">
      <div className="journey-view__top">
        <div className="journey-view__bar">
          {back}
          <ShareButton route={route} travelMode={session.travelMode} start={session.startLocation} destination={session.destinationLocation} />
        </div>
        <JourneyHeader
          routeNumber={journey.routeNumber}
          durationSeconds={route.durationSeconds}
          distanceMeters={route.distanceMeters}
          selected
          badges={badges?.get(route.id) ?? { fastest: false, shortest: false }}
          matchLabel={matchLabel}
          matchComplete={match?.complete ?? false}
          metro={route.metro}
          bus={route.bus}
        />
        <RouteSwitcher routes={session.routes} selectedRouteId={session.selectedRouteId} onSelect={onSelectRoute} />
        {offline !== undefined && preferences !== undefined && (
          <SaveOfflineControl route={route} travelMode={session.travelMode} start={session.startLocation} destination={session.destinationLocation} preferences={preferences} offline={offline} />
        )}
      </div>
      <div className="journey-view__timeline">
        <AccessibilityDetails route={route} requested={session.preference?.accessibility != null} />
        {route.metro !== undefined && (
          <>
            <MetroTimeline journey={route.metro} destinationName={journey.destinationName} selectedStationKey={selectedStationKey} onSelectStation={onSelectStation} />
            <h3 className="journey-view__subheading">Areas passed through</h3>
          </>
        )}
        {route.bus !== undefined && (
          <>
            <BusTimeline journey={route.bus} destinationName={journey.destinationName} selectedStopKey={selectedStationKey} onSelectStop={onSelectStation} />
            <h3 className="journey-view__subheading">Areas passed through</h3>
          </>
        )}
        <JourneyTimeline journey={journey} onSelectStop={onSelectArea} />
      </div>
    </div>
  )
})

function describeUnavailable(status: RouteSessionState['status'], hasSession: boolean): string {
  if (status === 'loading') {
    return 'Loading journey...'
  }
  if (status === 'error') {
    return 'This journey is no longer available.'
  }
  return hasSession ? 'Select a route to view the journey.' : 'No journey to show yet. Find routes first, then open the Journey View.'
}
