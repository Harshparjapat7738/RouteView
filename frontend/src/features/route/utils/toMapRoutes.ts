import type { MapRoute } from '../../map/types/map.ts'
import type { Route } from '../types/route.ts'
import { routeColor } from './routeColors.ts'

/** Translates the routes of a session into what the map draws; the map knows nothing about sessions. */
export function toMapRoutes(routes: readonly Route[]): MapRoute[] {
  return routes.map((route) => ({ id: route.id, path: route.path, color: routeColor(route.index) }))
}
