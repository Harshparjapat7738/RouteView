import { TRAVEL_MODE_INFO } from '../../route/types/travelMode.ts'
import { CRITERIA, type CriterionId, type PreferenceOutcome, type TravelPreferences } from '../types/preferences.ts'
import { isDefaultPreferences } from './preferencesData.ts'

const SHORT = new Map(CRITERIA.map((criterion) => [criterion.id, criterion.short]))
export const criterionShort = (id: CriterionId): string => SHORT.get(id) ?? id

const join = (items: readonly string[]): string => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

/** One line for the entry row: "Default order", "Fastest, Fewer transfers · Avoiding Bus". */
export function summarizePreferences(preferences: TravelPreferences): string {
  if (isDefaultPreferences(preferences)) return 'Default order'
  const parts: string[] = []
  const preferred = CRITERIA.filter((criterion) => preferences.prefer[criterion.id]).map((criterion) => criterion.short)
  if (preferences.accessibility.stepFree) preferred.push('Step-free stations')
  if (preferred.length > 0) parts.push(preferred.join(', '))
  const avoided: string[] = preferences.avoid.map((mode) => TRAVEL_MODE_INFO[mode].label)
  if (preferences.accessibility.avoidInaccessible) avoided.push('inaccessible stations')
  if (avoided.length > 0) parts.push(`Avoiding ${avoided.join(', ')}`)
  return parts.join(' · ')
}

/** What was removed and why, in plain words; null when nothing was removed. */
export function describeHidden(outcome: PreferenceOutcome): string | null {
  if (outcome.hiddenCount === 0) return null
  const modes = join(outcome.hiddenModes.map((mode) => TRAVEL_MODE_INFO[mode].label))
  if (outcome.noMatch) {
    return outcome.notSearched
      ? `You are avoiding ${modes}, so no ${modes} journeys are shown.`
      : `No journey matches your preferences: all ${outcome.totalCount} ${outcome.totalCount === 1 ? 'route uses' : 'routes use'} ${modes}, which you are avoiding.`
  }
  return `${outcome.hiddenCount} ${outcome.hiddenCount === 1 ? 'route is' : 'routes are'} hidden because ${outcome.hiddenCount === 1 ? 'it uses' : 'they use'} ${modes}, which you are avoiding.`
}

/** "Ordered by Fastest and Fewer transfers"; null when no preference shaped the order. */
export function describeRanking(outcome: PreferenceOutcome): string | null {
  return outcome.ranked.length === 0 ? null : `Ordered by ${join(outcome.ranked.map(criterionShort))}.`
}

/** One sentence per selected preference that could not be applied, so the person knows it was not used. */
export function describeUnapplied(outcome: PreferenceOutcome): string[] {
  return outcome.criteria
    .filter((criterion) => criterion.status === 'unavailable' || criterion.status === 'not-applicable')
    .map((criterion) => `${criterionShort(criterion.id)} could not be applied. ${criterion.reason ?? ''}`.trim())
}

export function describeUnverified(outcome: PreferenceOutcome): string | null {
  return outcome.unverifiedRoutes === 0
    ? null
    : `${outcome.unverifiedRoutes} ${outcome.unverifiedRoutes === 1 ? 'route has' : 'routes have'} a leg whose travel mode could not be identified, so avoiding could not be checked for ${outcome.unverifiedRoutes === 1 ? 'it' : 'them'}.`
}

const COVERAGE_CAVEAT = 'Lifts, step-free connections inside stations and the walk to the station are not verified.'

/**
 * What the accessibility preferences did, in plain words, with the limits stated: a verified station list is never presented as an
 * accessible journey, and a preference that could not be applied is reported instead of being dropped silently.
 */
export function describeAccessibility(outcome: PreferenceOutcome): string[] {
  const a = outcome.accessibility
  if (a === null) return []
  if (!a.applicable) {
    return ['Accessibility preferences could not be applied: station accessibility data exists only for Metro and Bus journeys, so these routes are shown unchanged and nothing is known about their accessibility.']
  }
  const lines: string[] = []
  const routes = (n: number) => `${n} ${n === 1 ? 'route' : 'routes'}`
  if (a.hiddenInaccessible > 0) {
    lines.push(`${routes(a.hiddenInaccessible)} hidden because ${a.hiddenInaccessible === 1 ? 'it uses' : 'they use'} a station listed as not accessible.`)
  } else if (a.allInaccessible) {
    lines.push('Every route uses a station listed as not accessible, so none was hidden. The stations are marked on each route.')
  }
  if (a.stepFree) {
    if (a.verifiedRoutes > 0) {
      lines.push(`${routes(a.verifiedRoutes)} of ${a.routeCount} ${a.verifiedRoutes === 1 ? 'has' : 'have'} every station listed as accessible${a.ranked ? ' and come first' : ''}. ${COVERAGE_CAVEAT}`)
    } else {
      lines.push(`No route could be verified as step-free: station accessibility is unknown, or listed as not accessible, for every route. Accessibility is not guaranteed on any of them.`)
    }
  } else if (a.avoidInaccessible && a.hiddenInaccessible === 0 && !a.allInaccessible && a.unknownRoutes > 0) {
    lines.push(`No station is listed as not accessible, but accessibility is unknown for ${routes(a.unknownRoutes)}, so none could be ruled out.`)
  }
  return lines
}
