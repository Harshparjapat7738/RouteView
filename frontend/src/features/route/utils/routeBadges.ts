import type { Route } from '../types/route.ts'

/** Factual comparison badges of one route. Only measured values are compared; there is no scoring. */
export interface RouteBadges {
  /** Lowest duration among the routes. */
  fastest: boolean
  /** Lowest distance among the routes (not used for metro journeys, where walking and transfers matter instead). */
  shortest: boolean
  /** Metro only: the lowest fare, when every route has a fare in the same currency. */
  lowestFare?: boolean
  /** Metro only: the fewest interchanges. */
  fewestTransfers?: boolean
  /** Metro only: the least walking. */
  leastWalking?: boolean
}

const NO_BADGES: RouteBadges = { fastest: false, shortest: false }

/**
 * Computes "Fastest" and "Shortest" for a set of routes without reordering or changing them.
 * Routes that tie for the lowest value all get the badge. When there is nothing to compare (a single
 * route, or every route has the same value) no badge is given, because it would say nothing.
 * "Selected" and "Matches ..." are not computed here: they come from the Route Session and the search.
 *
 * For metro journeys the comparison is Fastest / Lowest fare / Fewest transfers / Least walking, each given
 * only when the values really differ (and, for fares, only when every route reports one in the same currency).
 */
export function computeRouteBadges(routes: readonly Route[]): ReadonlyMap<string, RouteBadges> {
  if (routes.length > 0 && routes.every((route) => route.metro !== undefined)) {
    return computeMetroBadges(routes)
  }
  if (routes.length > 0 && routes.every((route) => route.bus !== undefined)) {
    return computeBusBadges(routes)
  }
  const lowestDuration = lowestIfDifferent(routes.map((route) => route.durationSeconds))
  const lowestDistance = lowestIfDifferent(routes.map((route) => route.distanceMeters))

  return new Map(
    routes.map((route) => [
      route.id,
      lowestDuration === null && lowestDistance === null
        ? NO_BADGES
        : {
            fastest: lowestDuration !== null && route.durationSeconds === lowestDuration,
            shortest: lowestDistance !== null && route.distanceMeters === lowestDistance,
          },
    ]),
  )
}

function computeMetroBadges(routes: readonly Route[]): ReadonlyMap<string, RouteBadges> {
  const lowestDuration = lowestIfDifferent(routes.map((route) => route.durationSeconds))
  const lowestTransfers = lowestIfDifferent(routes.map((route) => route.metro?.transfers ?? 0))
  const lowestWalking = lowestIfDifferent(routes.map((route) => route.metro?.walkingSeconds ?? 0))
  const currencies = new Set(routes.map((route) => route.metro?.fare?.currency ?? null))
  const comparableFares = routes.every((route) => route.metro?.fare != null) && currencies.size === 1
  const lowestFare = comparableFares ? lowestIfDifferent(routes.map((route) => Number(route.metro?.fare?.amount))) : null

  return new Map(
    routes.map((route) => [
      route.id,
      {
        fastest: lowestDuration !== null && route.durationSeconds === lowestDuration,
        shortest: false,
        lowestFare: lowestFare !== null && Number(route.metro?.fare?.amount) === lowestFare,
        fewestTransfers: lowestTransfers !== null && route.metro?.transfers === lowestTransfers,
        leastWalking: lowestWalking !== null && route.metro?.walkingSeconds === lowestWalking,
      },
    ]),
  )
}

/** Bus: Fastest / Fewest transfers / Shortest walking, each only when the values really differ. There is no fare badge: fares are not available. */
function computeBusBadges(routes: readonly Route[]): ReadonlyMap<string, RouteBadges> {
  const lowestDuration = lowestIfDifferent(routes.map((route) => route.durationSeconds))
  const lowestTransfers = lowestIfDifferent(routes.map((route) => route.bus?.transfers ?? 0))
  const lowestWalking = lowestIfDifferent(routes.map((route) => route.bus?.walkingSeconds ?? 0))
  return new Map(
    routes.map((route) => [
      route.id,
      {
        fastest: lowestDuration !== null && route.durationSeconds === lowestDuration,
        shortest: false,
        fewestTransfers: lowestTransfers !== null && route.bus?.transfers === lowestTransfers,
        leastWalking: lowestWalking !== null && route.bus?.walkingSeconds === lowestWalking,
      },
    ]),
  )
}

/** The smallest value, or null when there are fewer than two values or they are all equal. */
function lowestIfDifferent(values: readonly number[]): number | null {
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
    return null
  }
  const lowest = Math.min(...values)
  return values.every((value) => value === lowest) ? null : lowest
}
