import { memo } from 'react'
import type { MetroNetworkState } from '../../metro/hooks/useMetroNetwork.ts'
import { MetroIcon } from '../../../ui/Icons.tsx'
import { MapControlButton } from '../../../ui/MapControlButton.tsx'
import './MapMetroControl.css'

interface MapMetroControlProps {
  on: boolean
  state: MetroNetworkState
  enabled: boolean
  onToggle: () => void
  onRetry: () => void
}

function statusText(on: boolean, state: MetroNetworkState): string {
  if (!on) return ''
  switch (state.status) {
    case 'loading':
      return 'Loading metro network…'
    case 'unavailable':
      return 'Metro data is not imported. Place the DMRC GTFS feed in backend/metro.data, set METRO_IMPORT_SOURCE_VERSION, then run gradlew importMetro.'
    case 'error':
      return 'Metro network could not be loaded. Check the backend connection and retry.'
    default:
      return ''
  }
}

/**
 * Compact toggle for the Metro network layer, like the layer buttons of other map apps. It shows or hides
 * stations and lines only; it never changes the route, the travel mode or the selected journey.
 */
export const MapMetroControl = memo(function MapMetroControl({ on, state, enabled, onToggle, onRetry }: MapMetroControlProps) {
  const text = statusText(on, state)
  const failed = on && (state.status === 'error' || state.status === 'unavailable')
  return (
    <div className="map-metro-control">
      {text !== '' && (
        <div className="map-metro-control__status" role="status" data-metro-layer-status={state.status}>
          <span>{text}</span>
          {state.status === 'error' && (
            <button type="button" className="map-metro-control__retry" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
      <MapControlButton
        label={on ? 'Hide metro network' : 'Show metro network'}
        className="map-metro-control__button"
        tone={failed ? 'error' : on ? 'active' : 'default'}
        aria-pressed={on}
        aria-disabled={!enabled}
        data-metro-layer-toggle
        onClick={() => {
          if (enabled) onToggle()
        }}
      >
        <MetroIcon width={22} height={22} />
      </MapControlButton>
    </div>
  )
})
