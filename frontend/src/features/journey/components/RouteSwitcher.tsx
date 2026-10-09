import type { Route } from '../../route/types/route.ts'
import { formatDuration } from '../../route/utils/formatRoute.ts'
import { routeColor } from '../../route/utils/routeColors.ts'
import { CheckIcon } from '../../../ui/Icons.tsx'
import './JourneyView.css'

interface RouteSwitcherProps {
  routes: readonly Route[]
  selectedRouteId: string | null
  /** Selects another route of the same session (never a new calculation). */
  onSelect: (routeId: string) => void
}

/** Switches between the session's routes without leaving the Journey View. */
export function RouteSwitcher({ routes, selectedRouteId, onSelect }: RouteSwitcherProps) {
  if (routes.length < 2) {
    return null
  }
  return (
    <nav className="route-switcher" aria-label="Switch route">
      <ul className="route-switcher__list">
        {routes.map((route) => {
          const selected = route.id === selectedRouteId
          return (
            <li key={route.id}>
              <button
                type="button"
                className="route-switcher__button"
                aria-pressed={selected}
                aria-label={`Route ${route.index + 1}, ${formatDuration(route.durationSeconds)}${selected ? ', selected' : ''}`}
                onClick={() => onSelect(route.id)}
              >
                <span className="route-switcher__name">
                  <span className="route-switcher__swatch" style={{ backgroundColor: routeColor(route.index) }} aria-hidden="true" />
                  Route {route.index + 1}
                  {selected && <CheckIcon width={14} height={14} />}
                </span>
                <span className="route-switcher__time">{formatDuration(route.durationSeconds)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
