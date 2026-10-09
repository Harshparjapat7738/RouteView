import { memo } from 'react'
import { AdvancedMarker, Pin } from '@vis.gl/react-google-maps'
import { mapConfig } from '../config/mapConfig.ts'
import type { MapMarker } from '../types/map.ts'

interface MapMarkersProps {
  markers: readonly MapMarker[]
}

const KIND_LABEL: Record<MapMarker['kind'], string> = {
  start: 'Start',
  destination: 'Destination',
}

/** Renders start/destination pins. Must be a child of `<Map>`. */
export const MapMarkers = memo(function MapMarkers({ markers }: MapMarkersProps) {
  return (
    <>
      {markers.map((marker) => {
        const style = mapConfig.markerStyles[marker.kind]
        return (
          <AdvancedMarker
            key={marker.id}
            position={marker.position}
            title={`${KIND_LABEL[marker.kind]}: ${marker.label}`}
          >
            <Pin background={style.background} borderColor={style.borderColor} glyphColor="#ffffff" glyph={style.glyph} />
          </AdvancedMarker>
        )
      })}
    </>
  )
})
