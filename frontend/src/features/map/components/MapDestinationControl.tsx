import { memo } from 'react'
import { PinIcon } from '../../../ui/Icons.tsx'
import { MapControlButton } from '../../../ui/MapControlButton.tsx'
import './MapDestinationControl.css'

interface MapDestinationControlProps {
  /** A destination is confirmed. */
  active: boolean
  /** False until the map itself is ready. */
  enabled: boolean
  onChoose: () => void
}

/**
 * Floating "Choose destination" control. It opens route planning but never changes the destination itself.
 * It is different from the Current Location button above/below it.
 */
export const MapDestinationControl = memo(function MapDestinationControl({ active, enabled, onChoose }: MapDestinationControlProps) {
  return (
    <div className="map-destination">
      <MapControlButton
        label="Choose destination"
        className="map-destination__button"
        tone={active ? 'active' : 'default'}
        aria-disabled={!enabled}
        onClick={() => {
          if (enabled) {
            onChoose()
          }
        }}
      >
        <PinIcon width={22} height={22} />
      </MapControlButton>
    </div>
  )
})
