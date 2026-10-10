import type { LatLng } from '../../../types/geo.ts'
import type { Route } from '../../route/types/route.ts'

export const PASSING_AREA_RADIUS_METERS = 500

const EARTH_RADIUS_METERS = 6_371_008.8

/**
 * Returns the shortest distance from a point to the route geometry, or null when no geometry is available.
 * A local equirectangular projection is sufficiently accurate for the passing-area radius and avoids requiring
 * the optional Google geometry library.
 */
export function distanceToRouteMeters(path: readonly LatLng[], point: LatLng): number | null {
  if (path.length === 0) {
    return null
  }

  const radians = Math.PI / 180
  const latitude = point.lat * radians
  const longitudeScale = Math.cos(latitude)
  const project = (coordinate: LatLng) => ({
    x: longitudeDelta(coordinate.lng - point.lng) * radians * EARTH_RADIUS_METERS * longitudeScale,
    y: (coordinate.lat - point.lat) * radians * EARTH_RADIUS_METERS,
  })
  const points = path.map(project)

  if (points.length === 1) {
    const only = points[0]
    return only === undefined ? null : Math.hypot(only.x, only.y)
  }

  let shortest = Number.POSITIVE_INFINITY
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]
    const end = points[index]
    if (start === undefined || end === undefined) {
      continue
    }
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    const fraction =
      lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(start.x * dx + start.y * dy) / lengthSquared))
    shortest = Math.min(shortest, Math.hypot(start.x + fraction * dx, start.y + fraction * dy))
  }
  return Number.isFinite(shortest) ? shortest : null
}

export function routePassesNearPoint(route: Pick<Route, 'path'>, point: LatLng, radiusMeters = PASSING_AREA_RADIUS_METERS): boolean {
  const distance = distanceToRouteMeters(route.path, point)
  return distance !== null && distance <= radiusMeters
}

/** Keeps the supplied route order among ties while bringing routes that cover the selected point to the top. */
export function prioritizeRoutesByCoverage<T extends Pick<Route, 'id'>>(
  routes: readonly T[],
  matchingRouteIds: ReadonlySet<string>,
): T[] {
  return [...routes].sort((a, b) => Number(matchingRouteIds.has(b.id)) - Number(matchingRouteIds.has(a.id)))
}

function longitudeDelta(delta: number): number {
  return ((delta + 540) % 360) - 180
}
