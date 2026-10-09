import { useMemo } from 'react'
import type { Route } from '../../route/types/route.ts'
import { assessRouteAccess } from '../utils/assessRoute.ts'
import { describeRouteAccess } from '../utils/describeAccess.ts'
import './Accessibility.css'

interface RouteAccessNoteProps {
  route: Route
  /** An accessibility preference is on: say something for every route, including that nothing is known. */
  requested: boolean
}

/**
 * One compact line about the stations of a route, on the route card. Shown when the person asked for accessibility-aware routes,
 * and always when a station is listed as not accessible (a warning that should never need a setting). Text, never colour alone.
 */
export function RouteAccessNote({ route, requested }: RouteAccessNoteProps) {
  const access = useMemo(() => assessRouteAccess(route), [route])
  if (!access.applicable) {
    return requested ? (
      <p className="access-note" data-access-level="NOT_APPLICABLE" data-route-access="">
        No station accessibility data for this route.
      </p>
    ) : null
  }
  if (!requested && access.level !== 'HAS_INACCESSIBLE') return null
  const text = describeRouteAccess(access)
  if (text === null) return null
  return (
    <p className="access-note" data-access-level={access.level} data-route-access="">
      <span className="access-note__label">{access.level === 'HAS_INACCESSIBLE' ? 'Accessibility warning' : 'Accessibility'}</span> {text}
    </p>
  )
}
