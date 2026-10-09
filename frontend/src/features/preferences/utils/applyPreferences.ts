import type { Route } from '../../route/types/route.ts'
import { TRAVEL_MODE_INFO, type TravelMode } from '../../route/types/travelMode.ts'
import type { AccessibilityOutcome, CriterionId, CriterionOutcome, PreferenceOutcome, TravelPreferences } from '../types/preferences.ts'
import { CRITERIA } from '../types/preferences.ts'
import { assessRouteAccess } from '../../accessibility/utils/assessRoute.ts'
import type { AccessLevel, RouteAccess } from '../../accessibility/types/accessibility.ts'
import { modesOfRoute } from './routeModes.ts'

export interface PreferenceResult {
  /** The routes to show, best first. Provider order is kept for ties and when nothing could be applied. */
  routes: readonly Route[]
  outcome: PreferenceOutcome
}

/** Modes whose journeys are a single leg: there is nothing to transfer between or to walk to. */
const SINGLE_LEG_MODES: ReadonlySet<TravelMode> = new Set(['TWO_WHEELER', 'FOUR_WHEELER', 'WALKING', 'CYCLING'])

type Metric = (route: Route) => number | null

const finite = (value: number | null | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const durationOf: Metric = (route) => finite(route.durationSeconds)
const transfersOf: Metric = (route) => finite(route.metro?.transfers ?? route.bus?.transfers ?? route.transit?.transfers)
const walkingOf: Metric = (route) => {
  if (route.metro !== undefined) return finite(route.metro.walkingMeters)
  if (route.bus !== undefined) return finite(route.bus.walkingMeters)
  if (route.transit !== undefined) return route.transit.steps.filter((step) => step.kind === 'walk').reduce<number | null>((sum, step) => {
    const meters = finite(step.distanceMeters)
    return sum === null || meters === null ? null : sum + meters
  }, 0)
  return null
}
const fareOf: Metric = (route) => {
  const fare = route.metro?.fare
  return fare ? finite(Number(fare.amount)) : null
}

function allValues(routes: readonly Route[], metric: Metric): number[] | null {
  const values = routes.map(metric)
  return values.every((value): value is number => value !== null) ? values : null
}

function modeLabel(mode: TravelMode): string {
  return TRAVEL_MODE_INFO[mode].label
}

/** Decides whether (and how) one preference can be applied to these routes, without looking at any other preference. */
function assess(id: CriterionId, routes: readonly Route[], mode: TravelMode): { outcome: CriterionOutcome; values: number[] | null } {
  const make = (status: CriterionOutcome['status'], reason: string | null, values: number[] | null = null) => ({ outcome: { id, status, reason }, values })
  if (id === 'fastest') {
    const values = allValues(routes, durationOf)
    return values === null ? make('unavailable', 'Journey times are missing for some routes.') : compare(values)
  }
  if (id === 'lowestFare') {
    if (mode === 'BUS') return make('unavailable', 'Bus fares are not available, so routes cannot be compared by fare.')
    if (!routes.some((route) => route.metro !== undefined)) return make('unavailable', `Fares are not available for ${modeLabel(mode)} routes.`)
    const values = allValues(routes, fareOf)
    if (values === null) return make('unavailable', 'Some routes have no fare, so fares cannot be compared.')
    const currencies = new Set(routes.map((route) => route.metro?.fare?.currency))
    if (currencies.size !== 1) return make('unavailable', 'Fares are in different currencies, so they cannot be compared.')
    return compare(values)
  }
  if (SINGLE_LEG_MODES.has(mode)) {
    return make(
      'not-applicable',
      id === 'fewerTransfers' ? `Transfers do not apply to ${modeLabel(mode)} routes.` : `Walking amount does not apply to ${modeLabel(mode)} routes.`,
    )
  }
  const values = allValues(routes, id === 'fewerTransfers' ? transfersOf : walkingOf)
  if (values === null) {
    return make('unavailable', id === 'fewerTransfers' ? 'Transfer counts are missing for some routes.' : 'Walking distances are missing for some routes.')
  }
  return compare(values)

  function compare(measured: number[]) {
    if (routes.length < 2) return make('no-difference', 'There is only one route to compare.')
    return measured.every((value) => value === measured[0]) ? make('no-difference', 'The routes do not differ on this.') : make('applied', null, measured)
  }
}

/** Step-free order: all stations listed accessible, then partly known, then unknown (or no station data), then a station listed as not accessible. */
const ACCESS_TIER: Readonly<Record<AccessLevel, number>> = { ALL_LISTED: 0, PARTIAL: 1, UNKNOWN: 2, HAS_INACCESSIBLE: 3 }
const accessTier = (access: RouteAccess): number => (access.applicable ? ACCESS_TIER[access.level] : ACCESS_TIER.UNKNOWN)

/**
 * The accessibility preferences, applied after the travel-mode filter.
 *  - avoid: a route that uses a station listed as not accessible is removed, but only when another route remains; if every route
 *    has one, all stay and the outcome says so (never an empty list and never a silent ignore);
 *  - step-free: routes are ordered by how well their stations are verified; nothing else is removed.
 * Unknown is never treated as accessible: a route with unknown stations ranks below one with every station listed accessible.
 */
function applyAccessibility(shown: readonly Route[], preferences: TravelPreferences): { routes: readonly Route[]; tiers: number[] | null; outcome: AccessibilityOutcome | null } {
  const { stepFree, avoidInaccessible } = preferences.accessibility
  if (!stepFree && !avoidInaccessible) return { routes: shown, tiers: null, outcome: null }
  const all = shown.map((route) => ({ route, access: assessRouteAccess(route) }))
  const applicable = all.some((entry) => entry.access.applicable)
  const bad = all.filter((entry) => entry.access.level === 'HAS_INACCESSIBLE' && entry.access.applicable)
  const remove = avoidInaccessible && bad.length > 0 && bad.length < all.length
  const kept = remove ? all.filter((entry) => !(entry.access.applicable && entry.access.level === 'HAS_INACCESSIBLE')) : all
  const verified = kept.filter((entry) => entry.access.applicable && entry.access.level === 'ALL_LISTED').length
  const tiers = stepFree && applicable ? kept.map((entry) => accessTier(entry.access)) : null
  const differs = tiers !== null && tiers.some((tier) => tier !== tiers[0])
  return {
    routes: kept.map((entry) => entry.route),
    tiers: differs ? tiers : null,
    outcome: {
      stepFree,
      avoidInaccessible,
      applicable,
      ranked: differs,
      verifiedRoutes: verified,
      inaccessibleRoutes: bad.length,
      unknownRoutes: kept.filter((entry) => !entry.access.applicable || entry.access.unknown > 0).length,
      hiddenInaccessible: remove ? bad.length : 0,
      allInaccessible: avoidInaccessible && bad.length > 0 && !remove && bad.length === all.length,
      routeCount: kept.length,
    },
  }
}

/** Competition ranking: a route's rank is 1 + the number of routes that are strictly better; ties share a rank. */
function ranksOf(values: readonly number[]): number[] {
  return values.map((value) => 1 + values.filter((other) => other < value).length)
}

/**
 * Applies the personal preferences to the routes the routing engines returned.
 *
 * Filtering: a route is removed only when the engines report that it uses an avoided travel mode (the mode it was
 * searched with, or a transit leg whose vehicle was identified). A leg that cannot be identified never removes a route.
 *
 * Ranking: for every selected preference that can be compared on ALL remaining routes, each route gets a rank; the
 * route with the lowest total of ranks comes first and provider order breaks ties. A preference whose data is missing
 * for any route is left out and reported, never estimated. Ranking never removes a route.
 */
export function applyPreferences(routes: readonly Route[], searchedWith: TravelMode, preferences: TravelPreferences): PreferenceResult {
  const avoided = new Set(preferences.avoid)
  const hiddenModes = new Set<TravelMode>()
  let unverified = 0
  const shown: Route[] = []
  for (const route of routes) {
    const used = modesOfRoute(route, searchedWith)
    const hit = [...used.modes].filter((mode) => avoided.has(mode))
    if (hit.length > 0) {
      hit.forEach((mode) => hiddenModes.add(mode))
      continue
    }
    if (avoided.size > 0 && used.unidentifiedLegs > 0) unverified += 1
    shown.push(route)
  }

  const accessible = applyAccessibility(shown, preferences)
  const remaining = accessible.routes

  const selected = CRITERIA.filter((criterion) => preferences.prefer[criterion.id])
  const criteria: CriterionOutcome[] = []
  const rankSets: number[][] = []
  const ranked: CriterionId[] = []
  if (remaining.length > 0) {
    for (const criterion of selected) {
      const { outcome, values } = assess(criterion.id, remaining, searchedWith)
      criteria.push(outcome)
      if (outcome.status === 'applied' && values !== null) {
        rankSets.push(ranksOf(values))
        ranked.push(criterion.id)
      }
    }
  }

  // Step-free is the first key: verified stations come before any other preference is weighed (the other preferences order within a tier).
  const tiers = accessible.tiers
  let ordered: readonly Route[] = remaining
  if (rankSets.length > 0 || tiers !== null) {
    const totals = remaining.map((_, position) => rankSets.reduce((sum, ranks) => sum + (ranks[position] ?? 0), 0))
    ordered = remaining
      .map((route, position) => ({ route, total: totals[position] ?? 0, tier: tiers?.[position] ?? 0, position }))
      .sort((a, b) => a.tier - b.tier || a.total - b.total || a.route.index - b.route.index || a.position - b.position)
      .map((entry) => entry.route)
  }

  const hiddenCount = routes.length - shown.length
  return {
    routes: ordered,
    outcome: {
      ranked,
      criteria,
      totalCount: routes.length,
      hiddenCount,
      hiddenModes: [...hiddenModes],
      noMatch: routes.length > 0 && shown.length === 0,
      notSearched: false,
      unverifiedRoutes: unverified,
      accessibility: accessible.outcome,
    },
  }
}
