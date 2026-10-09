import { useMap } from '@vis.gl/react-google-maps'
import { useEffect } from 'react'
import { mapConfig } from '../config/mapConfig.ts'
import type { MapMarker, MapRoute } from '../types/map.ts'
import { readMapInsets } from '../utils/mapOverlays.ts'
import { clampInsets } from '../utils/viewportMath.ts'

/**
 * Moves the map so that all markers and route lines are visible, clear of the panels floating over the map.
 * Must run inside a `<Map>`. Only the set of routes (not the selection) triggers a refit.
 */
export function useFitMapToContent(markers: readonly MapMarker[], routes: readonly MapRoute[]): void {
  const map = useMap()

  useEffect(() => {
    if (!map) {
      return
    }
    const points: { lat: number; lng: number }[] = markers.map((marker) => marker.position)
    for (const route of routes) {
      for (const point of route.path) {
        points.push(point)
      }
    }
    const first = points[0]
    if (!first) {
      return
    }
    const allIdentical = points.every((point) => point.lat === first.lat && point.lng === first.lng)
    if (allIdentical) {
      map.panTo(first)
      map.setZoom(mapConfig.selectedLocationZoom)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    points.forEach((point) => bounds.extend(point))
    const element = map.getDiv()
    const insets = clampInsets({ width: element.clientWidth, height: element.clientHeight }, readMapInsets(element))
    map.fitBounds(bounds, insets)
  }, [map, markers, routes])
}
