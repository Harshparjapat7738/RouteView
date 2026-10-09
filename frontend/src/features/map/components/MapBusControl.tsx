import { memo } from 'react'
import { BusIcon } from '../../../ui/Icons.tsx'
import { MapControlButton } from '../../../ui/MapControlButton.tsx'
import './MapBusControl.css'

interface MapBusControlProps {
  on: boolean
  enabled: boolean
  onToggle: () => void
}

/**
 * Compact toggle for the Bus layer (bus stops near the part of the map in view). It shows or hides stops only; it never
 * changes the route, the travel mode or the selected journey.
 */
export const MapBusControl = memo(function MapBusControl({ on, enabled, onToggle }: MapBusControlProps) {
  return (
    <div className="map-bus-control">
      <MapControlButton
        label={on ? 'Hide bus stops' : 'Show bus stops'}
        className="map-bus-control__button"
        tone={on ? 'active' : 'default'}
        aria-pressed={on}
        aria-disabled={!enabled}
        data-bus-layer-toggle
        onClick={() => {
          if (enabled) onToggle()
        }}
      >
        <BusIcon width={22} height={22} />
      </MapControlButton>
    </div>
  )
})
