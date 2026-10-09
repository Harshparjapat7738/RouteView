import type { AccessPoint, AccessStatus, RouteAccess } from '../types/accessibility.ts'

export const STATUS_LABEL: Readonly<Record<AccessStatus, string>> = {
  ACCESSIBLE: 'Listed as accessible',
  INACCESSIBLE: 'Listed as not accessible',
  UNKNOWN: 'Accessibility unknown',
}

export const KIND_LABEL: Readonly<Record<AccessPoint['kind'], string>> = { BOARDING: 'Board', EXIT: 'Leave', TRANSFER: 'Change' }

/** What is not covered by the data, said wherever a station is described as accessible. */
export const NOT_VERIFIED = 'Lifts, step-free connections inside stations and the walk to the station are not verified.'

const join = (names: readonly string[]): string => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`)

/** One short line for a route card; null when the route has no station data. */
export function describeRouteAccess(access: RouteAccess): string | null {
  if (!access.applicable) return null
  const total = access.points.length
  switch (access.level) {
    case 'HAS_INACCESSIBLE':
      return `Uses a station listed as not accessible: ${join(access.points.filter((point) => point.accessibility.status === 'INACCESSIBLE').map((point) => point.name))}.`
    case 'ALL_LISTED':
      return `All ${total} ${total === 1 ? 'station is' : 'stations are'} listed as accessible. ${NOT_VERIFIED}`
    case 'PARTIAL':
      return `Accessibility is listed for ${access.accessible} of ${total} stations; the rest are unknown. ${NOT_VERIFIED}`
    default:
      return `Station accessibility is unknown for this route. ${NOT_VERIFIED}`
  }
}

/** "DMRC GTFS, version 2023-08-10", or null when the statement carries no source. */
export function describeSource(point: AccessPoint): string | null {
  const { source, sourceVersion } = point.accessibility
  if (source === null) return null
  return sourceVersion === null ? source : `${source}, version ${sourceVersion}`
}
