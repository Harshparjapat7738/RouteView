import { AdvancedMarker } from '@vis.gl/react-google-maps'
import { memo } from 'react'
import type { DetectedArea } from '../../route/types/detectedArea.ts'
import './MapRouteWaypoints.css'

interface MapRouteWaypointsProps {
  areas: readonly DetectedArea[]
  selectedAreaId: string | null
}

/** Marks real, route-derived geographical areas for the selected alternative. Must be inside `<Map>`. */
export const MapRouteWaypoints = memo(function MapRouteWaypoints({ areas, selectedAreaId }: MapRouteWaypointsProps) {
  return (
    <>
      {areas.map((area) => {
        if (area.areaId === selectedAreaId) {
          return null
        }
        return (
          <AdvancedMarker
            key={area.areaId}
            position={area.location}
            title={`${area.name} · waypoint ${area.sequence}`}
            zIndex={5}
          >
            <span className="map-route-waypoint" role="img" aria-label={`Route waypoint ${area.sequence}: ${area.name}`}>
              <span className="map-route-waypoint__index">{area.sequence}</span>
            </span>
          </AdvancedMarker>
        )
      })}
    </>
  )
})
