import type { RouteMatch } from '../types/routeMatch.ts'

/** Short text for how a route relates to the active search, e.g. "Matches all 2 selected areas". */
export function describeRouteMatch(match: RouteMatch): string {
  const first = match.areas[0]
  if (match.expected === null || (match.complete && match.expected === 1)) {
    return match.areas.length === 1 && first ? `Matches ${first.name}` : `Matches ${match.areas.length} areas`
  }
  return match.complete
    ? `Matches all ${match.expected} selected areas`
    : `Matches ${match.areas.length} of ${match.expected} areas`
}
