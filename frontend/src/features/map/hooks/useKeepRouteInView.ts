import { useMap } from '@vis.gl/react-google-maps'
import { useEffect, useRef } from 'react'
import type { MapRoute } from '../types/map.ts'
import { readMapInsets } from '../utils/mapOverlays.ts'
import { allPointsVisible, clampInsets } from '../utils/viewportMath.ts'

/** Layout changes settle after the bottom-sheet transition; the camera reacts once, after that. */
const SETTLE_MS = 260
const RESIZE_DEBOUNCE_MS = 160
/** A route that is only a few pixels outside the uncovered area is left alone. */
const SLACK_PX = 12

/**
 * Keeps the selected route inside the part of the map that is not covered by panels or the bottom sheet.
 * It reacts only to explicit events: another route selected, a view change (`layoutKey`: Journey View, sheet
 * height) or the map element changing size. It never listens to the user's own panning or zooming, never
 * animates when the route is already visible, and makes no request. Must run inside a `<Map>`.
 */
export function useKeepRouteInView(routes: readonly MapRoute[], selectedRouteId: string | null, layoutKey: string): void {
  const map = useMap()
  const latest = useRef({ routes, selectedRouteId })
  const previousLayout = useRef(layoutKey)
  useEffect(() => {
    latest.current = { routes, selectedRouteId }
  })

  useEffect(() => {
    if (!map) {
      return
    }
    const element = map.getDiv()
    let timer: number | undefined

    const ensureVisible = () => {
      const { routes: currentRoutes, selectedRouteId: selected } = latest.current
      const route = currentRoutes.find((candidate) => candidate.id === selected)
      const center = map.getCenter()
      const zoom = map.getZoom()
      if (!route || route.path.length === 0 || !center || zoom === undefined) {
        return
      }
      const size = { width: element.clientWidth, height: element.clientHeight }
      const insets = clampInsets(size, readMapInsets(element))
      if (allPointsVisible(route.path, { lat: center.lat(), lng: center.lng() }, zoom, size, insets, SLACK_PX)) {
        return
      }
      const bounds = new google.maps.LatLngBounds()
      route.path.forEach((point) => bounds.extend(point))
      map.fitBounds(bounds, insets)
    }

    const schedule = (delay: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(ensureVisible, delay)
    }

    // The map element changes size when the phone sheet changes height or the window is resized.
    let first = true
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false
        return
      }
      schedule(RESIZE_DEBOUNCE_MS)
    })
    observer.observe(element)
    // A view or sheet-height change waits for the layout to settle; choosing another route does not wait.
    const layoutChanged = previousLayout.current !== layoutKey
    previousLayout.current = layoutKey
    schedule(layoutChanged ? SETTLE_MS : 0)

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
    // Selection, route set and view changes re-run this effect; the closure itself reads the latest values.
  }, [map, selectedRouteId, routes, layoutKey])
}
