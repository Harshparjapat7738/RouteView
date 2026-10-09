import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { memo, useEffect } from 'react'
import { zoomForAccuracy } from '../utils/currentLocationZoom.ts'
import type { MapCurrentLocation } from '../types/map.ts'
import './MapCurrentLocationMarker.css'

interface MapCurrentLocationMarkerProps {
  location: MapCurrentLocation | null
}

/**
 * The user's position as a blue dot with a halo: round and blue, unlike the lettered Start/Destination pins.
 * There is at most one: a new position moves this marker instead of adding another. Each new fix (`fixId`) also
 * centres the map on it. Must be a child of `<Map>`; the marker is removed with the map.
 */
export const MapCurrentLocationMarker = memo(function MapCurrentLocationMarker({ location }: MapCurrentLocationMarkerProps) {
  const map = useMap()
  const fixId = location?.fixId
  const lat = location?.position.lat
  const lng = location?.position.lng
  const accuracy = location?.accuracyMeters ?? null

  useEffect(() => {
    if (!map || fixId === undefined || lat === undefined || lng === undefined) {
      return
    }
    map.panTo({ lat, lng })
    map.setZoom(zoomForAccuracy(accuracy))
    // Re-centre on each new fix only, not whenever the accuracy value is re-read.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fixId])

  if (!location) {
    return null
  }
  return (
    <AdvancedMarker position={location.position} title="Your current location" zIndex={20}>
      <div className="map-current-location" role="img" aria-label="Your current location">
        <span className="map-current-location__halo" />
        <span className="map-current-location__dot" />
      </div>
    </AdvancedMarker>
  )
})
