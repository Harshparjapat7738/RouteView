import type { LocationSelection } from '../../location/types/location.ts'
import type { BusNoRouteReason } from '../../bus/types/bus.ts'
import type { DetectedArea } from '../types/detectedArea.ts'
import type { Route } from '../types/route.ts'
import type { RouteSession } from '../types/routeSession.ts'
import { DEFAULT_TRAVEL_MODE, type TravelMode } from '../types/travelMode.ts'

/** Identifies the pair of locations a session (or an in-flight request) belongs to. */
export function locationKey(start: LocationSelection | null, destination: LocationSelection | null): string | null {
  return start && destination
    ? `${start.latitude},${start.longitude}>${destination.latitude},${destination.longitude}`
    : null
}

/**
 * Identifies one route request: the two locations AND the travel mode. A session (or a request in flight) belongs to
 * exactly one key, so changing the start, the destination or the travel mode never shows old routes as new ones.
 */
export function routeRequestKey(
  start: LocationSelection | null,
  destination: LocationSelection | null,
  travelMode: TravelMode,
): string | null {
  const locations = locationKey(start, destination)
  return locations === null ? null : `${locations}|${travelMode}`
}

/** Creates a session from a fresh calculation. The first route (the provider's preferred one) starts selected. */
export function createRouteSession(
  id: string,
  startLocation: LocationSelection,
  destinationLocation: LocationSelection,
  routes: readonly Route[],
  createdAt: number,
  travelMode: TravelMode = DEFAULT_TRAVEL_MODE,
  noRouteReason: BusNoRouteReason | null = null,
): RouteSession {
  const ordered = [...routes].sort((a, b) => a.index - b.index)
  return {
    id,
    startLocation,
    destinationLocation,
    travelMode,
    routes: ordered,
    selectedRouteId: ordered[0]?.id ?? null,
    selectedAreaId: null,
    createdAt,
    ...(noRouteReason !== null && ordered.length === 0 ? { noRouteReason } : {}),
  }
}

/**
 * Guarantees the session's own invariants: `selectedRouteId` is one of its routes (the first one if the given id is
 * unknown or missing, null when there are no routes) and `selectedAreaId` is an area of the selected route.
 * Returns the same object when nothing needs fixing.
 */
export function normalizeRouteSession(session: RouteSession): RouteSession {
  const routes = session.routes
  const selectedRoute = routes.find((route) => route.id === session.selectedRouteId) ?? routes[0] ?? null
  const selectedRouteId = selectedRoute?.id ?? null
  const areaValid =
    session.selectedAreaId === null ||
    (selectedRoute?.detectedAreas.some((area) => area.areaId === session.selectedAreaId) ?? false)
  if (selectedRouteId === session.selectedRouteId && areaValid) {
    return session
  }
  return {
    ...session,
    selectedRouteId,
    selectedAreaId: selectedRouteId === session.selectedRouteId && areaValid ? session.selectedAreaId : null,
  }
}

export function getSelectedRoute(session: RouteSession | null): Route | null {
  if (!session || session.selectedRouteId === null) {
    return null
  }
  return session.routes.find((route) => route.id === session.selectedRouteId) ?? null
}

/** Returns the session with another route selected; unknown ids and re-selection change nothing. */
export function selectRouteInSession(session: RouteSession, routeId: string): RouteSession {
  if (session.selectedRouteId === routeId || !session.routes.some((route) => route.id === routeId)) {
    return session
  }
  // An area belongs to one route's journey, so changing the route clears the area selection.
  return { ...session, selectedRouteId: routeId, selectedAreaId: null }
}

export function getSelectedArea(session: RouteSession | null): DetectedArea | null {
  if (!session || session.selectedAreaId === null) {
    return null
  }
  const areas = getSelectedRoute(session)?.detectedAreas ?? []
  return areas.find((area) => area.areaId === session.selectedAreaId) ?? null
}

/**
 * Selects a route and one of its areas in one step (used when the user chooses a search result).
 * Unknown routes are ignored; an area that does not belong to that route is ignored but the route is still selected.
 */
export function selectRouteAreaInSession(session: RouteSession, routeId: string, areaId: string): RouteSession {
  if (!session.routes.some((route) => route.id === routeId)) {
    return session
  }
  const withRoute = session.selectedRouteId === routeId ? session : { ...session, selectedRouteId: routeId, selectedAreaId: null }
  return selectAreaInSession(withRoute, areaId)
}

/**
 * Returns the session with an area of the selected route highlighted (null clears it).
 * The selected route never changes; ids that are not part of that route are ignored.
 */
export function selectAreaInSession(session: RouteSession, areaId: string | null): RouteSession {
  if (areaId === session.selectedAreaId) {
    return session
  }
  if (areaId !== null) {
    const areas = getSelectedRoute(session)?.detectedAreas ?? []
    if (!areas.some((area) => area.areaId === areaId)) {
      return session
    }
  }
  return { ...session, selectedAreaId: areaId }
}

export function createSessionId(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  return typeof randomUUID === 'function'
    ? randomUUID.call(globalThis.crypto)
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
