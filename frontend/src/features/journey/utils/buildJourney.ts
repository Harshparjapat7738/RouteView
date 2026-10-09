import type { DetectedArea } from '../../route/types/detectedArea.ts'
import type { Route } from '../../route/types/route.ts'
import type { RouteSession } from '../../route/types/routeSession.ts'

/** One geographical Journey Stop as the timeline shows it. */
export interface JourneyStopView {
  areaId: string
  name: string
  areaType: DetectedArea['areaType']
  /** 1-based place in travel order. */
  sequence: number
  /** 0 = start, 1 = destination. */
  position: number
  distanceFromStartMeters: number
  /** The stop belongs to the current search (its id is one of the route's matched areas). */
  matched: boolean
  /** The stop is the highlighted one. */
  selected: boolean
}

/** Start → geographical Journey Stops → Destination, for one route. */
export interface Journey {
  routeId: string
  /** 1-based route number, as in the route list. */
  routeNumber: number
  startName: string
  destinationName: string
  stops: readonly JourneyStopView[]
}

/**
 * Builds the timeline of a route from the Route Session. Pure: it reads data that already exists and never
 * requests anything. Stops are in travel order (`sequence`, then `positionAlongRoute`): never alphabetical and
 * never by coordinates. Start and destination are the session's locations, not detected areas. A stop is
 * "matched" only when its own id is in `matchedAreaIds` (ids of this route's areas), never because a name is similar.
 */
export function buildJourney(
  session: RouteSession,
  route: Route,
  matchedAreaIds: ReadonlySet<string>,
  selectedAreaId: string | null,
): Journey {
  const ordered = [...route.detectedAreas].sort(
    (a, b) => a.sequence - b.sequence || a.positionAlongRoute - b.positionAlongRoute,
  )
  return {
    routeId: route.id,
    routeNumber: route.index + 1,
    startName: session.startLocation.name,
    destinationName: session.destinationLocation.name,
    stops: ordered.map((area) => ({
      areaId: area.areaId,
      name: area.name,
      areaType: area.areaType,
      sequence: area.sequence,
      position: Math.min(1, Math.max(0, area.positionAlongRoute)),
      distanceFromStartMeters: area.distanceFromStartMeters,
      matched: matchedAreaIds.has(area.areaId),
      selected: area.areaId === selectedAreaId,
    })),
  }
}
