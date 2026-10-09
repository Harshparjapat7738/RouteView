import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { memo, useEffect } from 'react'
import { mapConfig } from '../config/mapConfig.ts'
import type { MapHighlight } from '../types/map.ts'
import { readMapInsets } from '../utils/mapOverlays.ts'
import { centerForVisiblePoint, clampInsets } from '../utils/viewportMath.ts'
import './MapAreaHighlight.css'

interface MapAreaHighlightProps {
  highlight: MapHighlight | null
}

/**
 * Marks the point of the selected route where a detected area is reached and brings it into view.
 * The position comes from RouteView's own data, never from Places. Must be a child of `<Map>`.
 */
export const MapAreaHighlight = memo(function MapAreaHighlight({ highlight }: MapAreaHighlightProps) {
  const map = useMap()
  const lat = highlight?.position.lat
  const lng = highlight?.position.lng

  useEffect(() => {
    if (!map || lat === undefined || lng === undefined) {
      return
    }
    // Bring the point to the middle of the part of the map that no panel covers, not the middle of the whole element.
    const zoom = Math.max(map.getZoom() ?? 0, mapConfig.areaHighlightMinZoom)
    const element = map.getDiv()
    const insets = clampInsets({ width: element.clientWidth, height: element.clientHeight }, readMapInsets(element))
    map.panTo(centerForVisiblePoint({ lat, lng }, zoom, insets))
    if ((map.getZoom() ?? 0) < zoom) {
      map.setZoom(zoom)
    }
  }, [map, lat, lng])

  if (!highlight) {
    return null
  }
  return (
    <AdvancedMarker position={highlight.position} title={highlight.label} zIndex={10}>
      <div className="map-area-highlight" role="img" aria-label={`Selected area: ${highlight.label}`}>
        <span className="map-area-highlight__label">{highlight.label}</span>
        <span className="map-area-highlight__dot" />
      </div>
    </AdvancedMarker>
  )
})
