import type { DetectedArea } from '../../route/types/detectedArea.ts'
import type { RouteMatch } from '../../route/types/routeMatch.ts'
import type { RouteSession } from '../../route/types/routeSession.ts'
import type {
  AreaSearchOutcome,
  AreaSearchQuery,
  AreaSearchResult,
  MatchingRoute,
  MatchQuality,
  MultiAreaMatch,
  RouteAreaMatch,
  SelectedArea,
} from '../types/areaSearch.ts'

export const MAX_QUERY_LENGTH = 100

const QUALITY_RANK: Record<MatchQuality, number> = { exact: 0, prefix: 1, contains: 2 }

/** Case-insensitive, whitespace-insensitive form of a name or query. */
export function normalizeName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Turns what the user typed into a query. Returns null when there is nothing to search for. */
export function parseQuery(raw: string): AreaSearchQuery | null {
  const text = raw.slice(0, MAX_QUERY_LENGTH).trim()
  const term = normalizeName(text)
  // Future multi-area search: split `term` into several terms here (for example on "+").
  return term === '' ? null : { text, terms: [term] }
}

/** How a (normalised) name matches a (normalised) term, or null when it does not. */
export function matchQuality(name: string, term: string): MatchQuality | null {
  if (name === term) {
    return 'exact'
  }
  if (name.startsWith(term)) {
    return 'prefix'
  }
  return name.includes(term) ? 'contains' : null
}

/**
 * Passing-Area Search: which of the calculated routes pass through the area the user typed?
 *
 * It looks ONLY at the geographical areas already detected for the routes of the given session
 * (`route.detectedAreas`). It makes no request, uses no Google service and never sees any other area,
 * so it cannot return places, businesses or anything outside the current journey.
 *
 *   session routes → detected areas → name match → grouped by area → ranked → matching routes
 */
export function searchPassingAreas(session: RouteSession | null, rawQuery: string): AreaSearchOutcome {
  return searchAreas(session, rawQuery, [])
}

/**
 * Suggestions for the multi-area search: detected areas matching what the user typed, ranked exact > prefix >
 * contains, leaving out the areas that are already selected. Same rules and data as `searchPassingAreas`.
 */
export function searchAreas(
  session: RouteSession | null,
  rawQuery: string,
  selected: readonly SelectedArea[],
): AreaSearchOutcome {
  if (session === null || session.routes.length === 0) {
    return { status: 'no-routes' }
  }
  const query = parseQuery(rawQuery)
  if (query === null) {
    return { status: 'empty-query' }
  }

  // Today: one term, one area. For several terms a later version would keep only the routes that
  // appear in the matches of every term (see findAreaMatches).
  const results = findAreaMatches(session, query.terms[0] ?? '').filter(
    (result) => !selected.some((area) => isSameArea(area, result.key, result.matchingRoutes.map((m) => m.area.areaId))),
  )
  return results.length === 0 ? { status: 'no-match', query: query.text } : { status: 'found', query: query.text, results }
}

/** All areas whose name matches `term` (already normalised), each with the routes that contain it. */
export function findAreaMatches(session: RouteSession, term: string): AreaSearchResult[] {
  const groups = new Map<string, { quality: MatchQuality; routes: MatchingRoute[] }>()

  for (const route of session.routes) {
    for (const area of route.detectedAreas) {
      const name = normalizeName(area.name)
      const quality = matchQuality(name, term)
      if (quality === null) {
        continue
      }
      // The same area on several routes is one result. Records of one area can carry different ids on
      // different routes, so areas are identified by name and type, as the detection engine does.
      const key = `${name}|${area.areaType}`
      const group = groups.get(key)
      if (group === undefined) {
        groups.set(key, { quality, routes: [{ route, area }] })
      } else if (!group.routes.some((match) => match.route.id === route.id)) {
        group.routes.push({ route, area })
      }
    }
  }

  const results: AreaSearchResult[] = []
  for (const [key, group] of groups) {
    const matchingRoutes = [...group.routes].sort((a, b) => a.route.index - b.route.index)
    const first = matchingRoutes[0]
    if (first !== undefined) {
      results.push({
        key,
        areaId: first.area.areaId,
        areaName: first.area.name,
        areaType: first.area.areaType,
        quality: group.quality,
        matchingRoutes,
      })
    }
  }

  // Exact, then prefix, then contains. Ties: the area on the earliest route, then by name: deterministic.
  return results.sort(
    (a, b) =>
      QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality] ||
      (a.matchingRoutes[0]?.route.index ?? 0) - (b.matchingRoutes[0]?.route.index ?? 0) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  )
}

/**
 * For each route that passes through a found area, the matched areas of that route (in the order they were
 * found). Routes that do not match are absent. Used to mark matching routes and stops in the route comparison.
 */
export function matchedAreasByRoute(outcome: AreaSearchOutcome): ReadonlyMap<string, readonly DetectedArea[]> {
  const byRoute = new Map<string, DetectedArea[]>()
  if (outcome.status === 'found') {
    for (const result of outcome.results) {
      for (const { route, area } of result.matchingRoutes) {
        byRoute.set(route.id, [...(byRoute.get(route.id) ?? []), area])
      }
    }
  }
  return byRoute
}

// ---------------------------------------------------------------------------------------------------------------
// Multi-area search: several selected areas, routes that pass through all of them.
// ---------------------------------------------------------------------------------------------------------------

/** Cross-route identity of a detected area: the same place can carry different ids on different routes. */
export function areaKey(area: DetectedArea): string {
  return `${normalizeName(area.name)}|${area.areaType}`
}

function isSameArea(selected: SelectedArea, key: string, ids: readonly string[]): boolean {
  return selected.key === key || ids.includes(selected.areaId)
}

/**
 * Keeps only the selected areas that exist in the session (by cross-route key or id). Used so a selection can
 * never refer to an area of another or an earlier session.
 */
export function pruneSelectedAreas(session: RouteSession | null, selected: readonly SelectedArea[]): readonly SelectedArea[] {
  if (session === null) {
    return selected.length === 0 ? selected : []
  }
  const keys = new Set<string>()
  const ids = new Set<string>()
  for (const route of session.routes) {
    for (const area of route.detectedAreas) {
      keys.add(areaKey(area))
      ids.add(area.areaId)
    }
  }
  const kept = selected.filter((area) => keys.has(area.key) || ids.has(area.areaId))
  return kept.length === selected.length ? selected : kept
}

/** Turns a suggestion into a selection record. */
export function toSelectedArea(result: AreaSearchResult): SelectedArea {
  return { key: result.key, areaId: result.areaId, areaName: result.areaName, areaType: result.areaType }
}

/** Adds an area to the selection. An area that is already selected (same id or same name and type) is not added twice. */
export function addSelectedArea(selected: readonly SelectedArea[], area: SelectedArea): readonly SelectedArea[] {
  return selected.some((existing) => isSameArea(existing, area.key, [area.areaId])) ? selected : [...selected, area]
}

/** Removes one area; the others stay. */
export function removeSelectedArea(selected: readonly SelectedArea[], key: string): readonly SelectedArea[] {
  return selected.filter((area) => area.key !== key)
}

/**
 * Which routes pass through the selected areas? Purely local: it reads the detected areas of the session's
 * routes. A route is a full match only when EVERY selected area is among its detected areas; a route that has
 * only some is a partial match and never counts as a full one. The matched areas of a route come back in that
 * route's own travel order (`sequence`), not in the order they were selected and never alphabetical. When an
 * area appears more than once on a route, its first occurrence is used.
 */
export function matchRoutesByAreas(session: RouteSession | null, selected: readonly SelectedArea[]): MultiAreaMatch {
  const unique = selected.reduce<readonly SelectedArea[]>((list, area) => addSelectedArea(list, area), [])
  const fullMatches: RouteAreaMatch[] = []
  const partialMatches: RouteAreaMatch[] = []
  if (session === null || unique.length === 0) {
    return { selected: unique, fullMatches, partialMatches }
  }

  for (const route of [...session.routes].sort((a, b) => a.index - b.index)) {
    const matched = new Map<string, DetectedArea>()
    let found = 0
    for (const wanted of unique) {
      const hits = route.detectedAreas.filter((area) => isSameArea(wanted, areaKey(area), [area.areaId]))
      const first = [...hits].sort((a, b) => a.sequence - b.sequence)[0]
      if (first !== undefined) {
        found += 1
        matched.set(first.areaId, first)
      }
    }
    if (found > 0) {
      const matchedAreas = [...matched.values()].sort((a, b) => a.sequence - b.sequence)
      const complete = found === unique.length
      ;(complete ? fullMatches : partialMatches).push({ route, matchedAreas, complete })
    }
  }
  return { selected: unique, fullMatches, partialMatches }
}

/** The per-route view the route comparison renders for a multi-area search. */
export function toRouteMatches(match: MultiAreaMatch): ReadonlyMap<string, RouteMatch> {
  const byRoute = new Map<string, RouteMatch>()
  for (const entry of [...match.fullMatches, ...match.partialMatches]) {
    byRoute.set(entry.route.id, { areas: entry.matchedAreas, expected: match.selected.length, complete: entry.complete })
  }
  return byRoute
}

/** The per-route view for plain typing (no selected area yet): every route containing a found area matches. */
export function toTypedRouteMatches(outcome: AreaSearchOutcome): ReadonlyMap<string, RouteMatch> {
  const byRoute = new Map<string, RouteMatch>()
  for (const [routeId, areas] of matchedAreasByRoute(outcome)) {
    byRoute.set(routeId, { areas, expected: null, complete: true })
  }
  return byRoute
}
