import { useMemo } from 'react'
import type { Route } from '../../route/types/route.ts'
import { assessRouteAccess } from '../utils/assessRoute.ts'
import { KIND_LABEL, NOT_VERIFIED, STATUS_LABEL, describeSource } from '../utils/describeAccess.ts'
import './Accessibility.css'

interface AccessibilityDetailsProps {
  route: Route
  requested: boolean
}

/**
 * The Journey View's accessibility block: every station where the rider boards, leaves or changes, with what the dataset says and
 * where that statement comes from. It never states that the journey is accessible; it says what is and is not verified.
 */
export function AccessibilityDetails({ route, requested }: AccessibilityDetailsProps) {
  const access = useMemo(() => assessRouteAccess(route), [route])
  if (!access.applicable) return null
  if (!requested && access.accessible === 0 && access.inaccessible === 0) return null
  return (
    <section className="access-details" aria-labelledby="access-details-title" data-access-details="">
      <h3 id="access-details-title" className="access-details__title">
        Accessibility
      </h3>
      <ul className="access-details__list">
        {access.points.map((point) => {
          const source = describeSource(point)
          return (
            <li key={`${point.kind}:${point.key}`} className="access-details__row" data-access-status={point.accessibility.status}>
              <span className="access-details__kind">{KIND_LABEL[point.kind]}</span>
              <span className="access-details__name">{point.name}</span>
              <span className="access-details__status">{STATUS_LABEL[point.accessibility.status]}</span>
              {source !== null && <span className="access-details__source">Source: {source}</span>}
            </li>
          )
        })}
      </ul>
      <p className="access-details__caveat">
        {access.level === 'ALL_LISTED' ? 'Every station above is listed as accessible. ' : ''}
        {NOT_VERIFIED} The data is static and may be out of date.
      </p>
    </section>
  )
}
