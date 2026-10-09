import { memo } from 'react'
import { Polyline } from '@vis.gl/react-google-maps'
import type { MapRoute } from '../types/map.ts'

interface MapRoutesProps {
  routes: readonly MapRoute[]
  selectedRouteId: string | null
  /** Routes drawn as secondary while a search is active (the lines are not recalculated or redrawn). */
  dimmedRouteIds?: ReadonlySet<string>
  onRouteSelect?: (routeId: string) => void
  /** Routes whose own line is drawn by another layer (the selected bus journey draws its rides and walks itself). */
  hiddenRouteIds?: ReadonlySet<string>
}

/** Draws route lines; the selected one is thicker and on top. Must be a child of `<Map>`. */
export const MapRoutes = memo(function MapRoutes({ routes, selectedRouteId, dimmedRouteIds, onRouteSelect, hiddenRouteIds }: MapRoutesProps) {
  return (
    <>
      {routes.map((route) => {
        if (hiddenRouteIds?.has(route.id) === true) {
          return null
        }
        const selected = route.id === selectedRouteId
        const dimmed = !selected && dimmedRouteIds?.has(route.id) === true
        return (
          <Polyline
            key={route.id}
            path={route.path as google.maps.LatLngLiteral[]}
            strokeColor={route.color}
            strokeWeight={selected ? 7 : 5}
            strokeOpacity={selected ? 1 : dimmed ? 0.25 : 0.55}
            zIndex={selected ? 2 : 1}
            clickable={onRouteSelect !== undefined}
            onClick={() => onRouteSelect?.(route.id)}
          />
        )
      })}
    </>
  )
})
