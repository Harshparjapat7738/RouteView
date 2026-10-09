import type { RouteSession } from '../types/routeSession.ts'
import { normalizeRouteSession, selectAreaInSession, selectRouteAreaInSession, selectRouteInSession } from './routeSession.ts'

/**
 * What the route feature currently knows. `key` ties a state to the locations it was
 * calculated for, so it is never shown for different locations.
 */
export type RouteSessionState =
  | { status: 'none' }
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; session: RouteSession }
  /** `canTryAgain`: repeating the same request can help, so the UI offers "Try again". */
  | { status: 'error'; key: string; message: string; canTryAgain: boolean; unsupportedMode?: boolean }

export type RouteSessionAction =
  | { type: 'calculationStarted'; key: string }
  | { type: 'calculationSucceeded'; key: string; session: RouteSession }
  | { type: 'calculationFailed'; key: string; message: string; canTryAgain: boolean; unsupportedMode?: boolean }
  /** The pending request was cancelled because the locations changed: nothing is pending any more. */
  | { type: 'calculationAbandoned'; key: string }
  /** The locations changed: whatever was stored for the old locations (pending or finished) is dropped for good. */
  | { type: 'sessionDiscarded'; key: string }
  | { type: 'routeSelected'; routeId: string }
  | { type: 'areaSelected'; areaId: string | null }
  | { type: 'routeAreaSelected'; routeId: string; areaId: string }

export const NO_ROUTE_SESSION: RouteSessionState = { status: 'none' }

export function routeSessionReducer(state: RouteSessionState, action: RouteSessionAction): RouteSessionState {
  switch (action.type) {
    case 'calculationStarted':
      return { status: 'loading', key: action.key }
    case 'calculationSucceeded':
      // A result only applies to the request that is still pending.
      return state.status === 'loading' && state.key === action.key
        ? { status: 'ready', key: action.key, session: normalizeRouteSession(action.session) }
        : state
    case 'calculationFailed':
      return state.status === 'loading' && state.key === action.key
        ? {
            status: 'error',
            key: action.key,
            message: action.message,
            canTryAgain: action.canTryAgain,
            ...(action.unsupportedMode === true ? { unsupportedMode: true } : {}),
          }
        : state
    case 'calculationAbandoned':
      return state.status === 'loading' && state.key === action.key ? NO_ROUTE_SESSION : state
    case 'sessionDiscarded':
      return state.status !== 'none' && state.key === action.key ? NO_ROUTE_SESSION : state
    case 'routeSelected': {
      if (state.status !== 'ready') {
        return state
      }
      const session = selectRouteInSession(state.session, action.routeId)
      return session === state.session ? state : { ...state, session }
    }
    case 'routeAreaSelected': {
      if (state.status !== 'ready') {
        return state
      }
      const session = selectRouteAreaInSession(state.session, action.routeId, action.areaId)
      return session === state.session ? state : { ...state, session }
    }
    case 'areaSelected': {
      if (state.status !== 'ready') {
        return state
      }
      const session = selectAreaInSession(state.session, action.areaId)
      return session === state.session ? state : { ...state, session }
    }
  }
}
