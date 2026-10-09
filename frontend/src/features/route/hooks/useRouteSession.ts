import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { LocationSelection } from '../../location/types/location.ts'
import { validateLocationPair } from '../../location/utils/locationValidation.ts'
import { fetchRouteResult } from '../services/routeApi.ts'
import { createRouteSession, createSessionId, getSelectedArea, getSelectedRoute, routeRequestKey } from '../state/routeSession.ts'
import { createRouteRequestSlot } from '../state/routeRequestSlot.ts'
import { NO_ROUTE_SESSION, routeSessionReducer, type RouteSessionState } from '../state/routeSessionReducer.ts'
import type { DetectedArea } from '../types/detectedArea.ts'
import type { Route } from '../types/route.ts'
import type { TravelMode } from '../types/travelMode.ts'
import type { RouteSession } from '../types/routeSession.ts'
import { toGoogleApiError } from '../../../services/google/googleFailure.ts'
import { runWithPolicy } from '../../../services/google/requestPolicy.ts'

/** Time limit of one attempt; the backend itself gives up on Google after about 13 seconds. */
const ROUTE_ATTEMPT_TIMEOUT_MS = 16_000
/** One more attempt for a transient failure (lost connection, temporary outage); never for quota, permission or input errors. */
const ROUTE_MAX_RETRIES = 1
const ROUTE_RETRY_DELAY_MS = 800

interface RouteSessionApi {
  /** The session state for the current locations; `none` once either location changes. */
  state: RouteSessionState
  session: RouteSession | null
  selectedRoute: Route | null
  /** The highlighted area of the selected route, if any. */
  selectedArea: DetectedArea | null
  /** Calculates routes and creates a new session. Does nothing if the locations are invalid or a session already exists for them. */
  calculate: () => void
  /** Selects one of the session's routes. Never calls the routing API. */
  selectRoute: (routeId: string) => void
  /** Highlights a detected area of the selected route (null clears it). Never changes the selected route or calls the API. */
  selectArea: (areaId: string | null) => void
  /** Selects a route and highlights one of its areas at once (a chosen search result). Never calls the API. */
  selectRouteArea: (routeId: string, areaId: string) => void
}

/**
 * Owns the Route Session: requests routes for the selected locations, creates the session
 * and tracks which route is selected. Plain React state (useReducer); no extra library.
 */
export function useRouteSession(
  start: LocationSelection | null,
  destination: LocationSelection | null,
  travelMode: TravelMode,
): RouteSessionApi {
  // The mode is part of the key: another mode is another request, and a result is never shown for a different one.
  const key = routeRequestKey(start, destination, travelMode)
  const [stored, dispatch] = useReducer(routeSessionReducer, NO_ROUTE_SESSION)
  // Holds the one request that may update the state (see routeRequestSlot).
  const [requests] = useState(createRouteRequestSlot)

  // A request never outlives its locations: when they change (or the page unmounts) it is cancelled, and a
  // calculation still marked as pending for them is dropped so it cannot stay "loading" forever.
  useEffect(
    () => () => {
      const pendingKey = requests.cancel()
      if (pendingKey !== null) {
        dispatch({ type: 'calculationAbandoned', key: pendingKey })
      }
      // The result for the old locations (if any) is dropped as well: changing the locations back never revives it.
      if (key !== null) {
        dispatch({ type: 'sessionDiscarded', key })
      }
    },
    [key, requests],
  )

  // A state never outlives a change of locations.
  const state = stored.status !== 'none' && stored.key === key ? stored : NO_ROUTE_SESSION

  // `calculate` reads the latest state through a ref, so selecting a route or an area (which changes the state)
  // does not give it a new identity and the location panel is not re-rendered for it.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  const calculate = useCallback(() => {
    if (!start || !destination || key === null || validateLocationPair(start, destination) !== null) {
      return
    }
    const current = stateRef.current
    // The routes for these locations are already known: selecting needs no new request.
    if (current.status === 'loading' || (current.status === 'ready' && current.session.routes.length > 0)) {
      return
    }

    const request = requests.begin(key)
    if (request === null) {
      return // already pending for these locations
    }
    dispatch({ type: 'calculationStarted', key })

    runWithPolicy((signal) => fetchRouteResult(start, destination, travelMode, signal), {
      operation: 'routeCalculation',
      timeoutMs: ROUTE_ATTEMPT_TIMEOUT_MS,
      maxRetries: ROUTE_MAX_RETRIES,
      retryDelayMs: ROUTE_RETRY_DELAY_MS,
      signal: request.controller.signal,
    })
      .then(({ routes, noRouteReason }) => {
        // Only the latest request may update the session; a cancelled one is ignored here and by the reducer.
        if (!requests.isCurrent(request)) {
          return
        }
        const session = createRouteSession(createSessionId(), start, destination, routes, Date.now(), travelMode, noRouteReason)
        dispatch({ type: 'calculationSucceeded', key, session })
      })
      .catch((error: unknown) => {
        if (!requests.isCurrent(request)) {
          return // superseded, cancelled or unmounted
        }
        const failure = toGoogleApiError(error, 'routeCalculation')
        dispatch({
          type: 'calculationFailed',
          key,
          message: failure.message,
          canTryAgain: failure.canTryAgain,
          unsupportedMode: failure.kind === 'unsupported-mode',
        })
      })
      .finally(() => requests.finish(request))
  }, [start, destination, travelMode, key, requests])

  const selectRoute = useCallback((routeId: string) => dispatch({ type: 'routeSelected', routeId }), [])

  const selectArea = useCallback((areaId: string | null) => dispatch({ type: 'areaSelected', areaId }), [])

  const selectRouteArea = useCallback(
    (routeId: string, areaId: string) => dispatch({ type: 'routeAreaSelected', routeId, areaId }),
    [],
  )

  const session = state.status === 'ready' ? state.session : null
  return {
    state,
    session,
    selectedRoute: getSelectedRoute(session),
    selectedArea: getSelectedArea(session),
    calculate,
    selectRoute,
    selectArea,
    selectRouteArea,
  }
}
