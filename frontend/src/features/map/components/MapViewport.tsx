import { memo } from 'react'
import { useFitMapToContent } from '../hooks/useFitMapToContent.ts'
import { useKeepRouteInView } from '../hooks/useKeepRouteInView.ts'
import type { MapMarker, MapRoute } from '../types/map.ts'

interface MapViewportProps {
  markers: readonly MapMarker[]
  routes: readonly MapRoute[]
  selectedRouteId: string | null
  /** Changes whenever the surrounding layout changes (Journey View, bottom-sheet height). */
  layoutKey: string
}

/** Render-less: keeps markers and routes in view, clear of the panels. Must be a child of `<Map>`. */
export const MapViewport = memo(function MapViewport({ markers, routes, selectedRouteId, layoutKey }: MapViewportProps) {
  useFitMapToContent(markers, routes)
  useKeepRouteInView(routes, selectedRouteId, layoutKey)
  return null
})
