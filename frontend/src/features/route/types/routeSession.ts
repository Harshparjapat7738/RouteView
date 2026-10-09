import type { LocationSelection } from '../../location/types/location.ts'
import type { BusNoRouteReason } from '../../bus/types/bus.ts'
import type { PreferenceOutcome } from '../../preferences/types/preferences.ts'
import type { Route } from './route.ts'
import type { TravelMode } from './travelMode.ts'

/**
 * The currently calculated journey: the two locations, every route calculated for them
 * (with full geometry) and which route the user has selected.
 *
 * It lives in application state only; nothing is persisted. Later features (area detection,
 * journey view, passing-area search) read from the session instead of calling the routing API again.
 */
export interface RouteSession {
  /** Identifies this calculation; a new calculation creates a new session. */
  id: string
  startLocation: LocationSelection
  destinationLocation: LocationSelection
  /** The mode every route of this session was calculated for. */
  travelMode: TravelMode
  /** Ordered by `Route.index`. May be empty when no route exists between the locations. */
  routes: readonly Route[]
  /** Always the id of one of `routes`, or null when there are no routes. */
  selectedRouteId: string | null
  /** The detected area the user picked on the selected route, or null. Always belongs to the selected route. */
  selectedAreaId: string | null
  /** Bus only: why no journey was found (when `routes` is empty), so the message can say so. */
  noRouteReason?: BusNoRouteReason
  /** Set on the view of a session that the personal preferences were applied to (see `usePreferredSession`); never stored. */
  preference?: PreferenceOutcome
  /** Creation time in milliseconds since the epoch. */
  createdAt: number
}
