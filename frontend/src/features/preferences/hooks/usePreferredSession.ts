import { useCallback, useMemo, useState } from 'react'
import type { LocationSelection } from '../../location/types/location.ts'
import { createRouteSession, createSessionId, routeRequestKey } from '../../route/state/routeSession.ts'
import type { RouteSessionState } from '../../route/state/routeSessionReducer.ts'
import type { DetectedArea } from '../../route/types/detectedArea.ts'
import type { Route } from '../../route/types/route.ts'
import type { RouteSession } from '../../route/types/routeSession.ts'
import type { TravelMode } from '../../route/types/travelMode.ts'
import type { useRouteSession } from '../../route/hooks/useRouteSession.ts'
import type { PreferenceOutcome, TravelPreferences } from '../types/preferences.ts'
import { applyPreferences } from '../utils/applyPreferences.ts'

type RouteSessionApi = ReturnType<typeof useRouteSession>

export interface PreferredSessionApi {
  state: RouteSessionState
  session: RouteSession | null
  selectedRoute: Route | null
  selectedArea: DetectedArea | null
  /** Calculates routes; false when nothing was requested because the travel mode is one the person avoids. */
  calculate: () => boolean
  selectRoute: (routeId: string) => void
  selectArea: (areaId: string | null) => void
  selectRouteArea: (routeId: string, areaId: string) => void
}

function emptyOutcome(mode: TravelMode): PreferenceOutcome {
  return { ranked: [], criteria: [], totalCount: 0, hiddenCount: 1, hiddenModes: [mode], noMatch: true, notSearched: true, unverifiedRoutes: 0, accessibility: null }
}

/**
 * The Route Session as the person wants to see it: the same routes, ordered and filtered by their preferences.
 *
 * The session itself is untouched (so changing a preference never recalculates, and switching it off brings every
 * route back). Until the person picks a route themselves, the selected route is the best-ranked visible one; after
 * that, their choice stays selected for as long as it is visible. One selection feeds the list, the Journey View
 * and the map, because they all read this view.
 */
export function usePreferredSession(
  api: RouteSessionApi,
  start: LocationSelection | null,
  destination: LocationSelection | null,
  travelMode: TravelMode,
  preferences: TravelPreferences,
): PreferredSessionApi {
  const key = routeRequestKey(start, destination, travelMode)
  const avoidedMode = preferences.avoid.includes(travelMode)
  const [pin, setPin] = useState<{ sessionId: string; routeId: string } | null>(null)
  // A search that was not made because its mode is avoided: remembered for the locations it was asked for.
  const [skipped, setSkipped] = useState<{ key: string; session: RouteSession } | null>(null)

  const raw = api.session
  const view = useMemo(() => {
    if (raw === null) return null
    const { routes, outcome } = applyPreferences(raw.routes, raw.travelMode, preferences)
    const sameRoutes = routes.length === raw.routes.length && routes.every((route, position) => route === raw.routes[position])
    const pinned = pin !== null && pin.sessionId === raw.id && routes.some((route) => route.id === pin.routeId) ? pin.routeId : null
    const selectedRouteId = pinned ?? routes[0]?.id ?? null
    const areaKept = selectedRouteId === raw.selectedRouteId && raw.selectedAreaId !== null
    const session: RouteSession = {
      ...raw,
      routes: sameRoutes ? raw.routes : routes,
      selectedRouteId,
      selectedAreaId: areaKept ? raw.selectedAreaId : null,
      preference: outcome,
    }
    return session
  }, [raw, preferences, pin])

  const skippedSession = skipped !== null && skipped.key === key && avoidedMode && api.state.status === 'none' ? skipped.session : null

  const session = view ?? skippedSession
  const state = useMemo<RouteSessionState>(() => {
    if (view !== null && api.state.status === 'ready' && key !== null) return { status: 'ready', key: api.state.key, session: view }
    if (skippedSession !== null && key !== null) return { status: 'ready', key, session: skippedSession }
    return api.state
  }, [api.state, view, skippedSession, key])

  const selectedRoute = useMemo(() => session?.routes.find((route) => route.id === session.selectedRouteId) ?? null, [session])
  const selectedArea = useMemo(
    () => (selectedRoute !== null && session?.selectedAreaId ? (selectedRoute.detectedAreas.find((area) => area.areaId === session.selectedAreaId) ?? null) : null),
    [selectedRoute, session],
  )

  const { calculate: rawCalculate, selectRoute: rawSelectRoute, selectArea: rawSelectArea, selectRouteArea: rawSelectRouteArea } = api
  const calculate = useCallback(() => {
    if (avoidedMode && start !== null && destination !== null && key !== null) {
      const empty = createRouteSession(createSessionId(), start, destination, [], Date.now(), travelMode)
      setSkipped({ key, session: { ...empty, preference: emptyOutcome(travelMode) } })
      return false
    }
    rawCalculate()
    return true
  }, [avoidedMode, start, destination, key, travelMode, rawCalculate])

  const selectRoute = useCallback(
    (routeId: string) => {
      if (raw !== null) setPin({ sessionId: raw.id, routeId })
      rawSelectRoute(routeId)
    },
    [raw, rawSelectRoute],
  )
  const selectRouteArea = useCallback(
    (routeId: string, areaId: string) => {
      if (raw !== null) setPin({ sessionId: raw.id, routeId })
      rawSelectRouteArea(routeId, areaId)
    },
    [raw, rawSelectRouteArea],
  )
  const shownSelectedId = view?.selectedRouteId ?? null
  const selectArea = useCallback(
    (areaId: string | null) => {
      // An area belongs to the route that is shown as selected, which may be the ranked one rather than the stored one.
      if (raw !== null && shownSelectedId !== null) {
        setPin({ sessionId: raw.id, routeId: shownSelectedId })
        if (shownSelectedId !== raw.selectedRouteId) rawSelectRoute(shownSelectedId)
      }
      rawSelectArea(areaId)
    },
    [raw, shownSelectedId, rawSelectRoute, rawSelectArea],
  )

  return { state, session, selectedRoute, selectedArea, calculate, selectRoute, selectArea, selectRouteArea }
}
