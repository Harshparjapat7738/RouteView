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
}

function statusText(on: boolean, state: MetroNetworkState): string {
  if (!on) return ''
  switch (state.status) {
    case 'loading':
      return 'Loading metro network...'
    case 'unavailable':
      return 'Metro network data has not been imported yet.'
    case 'error':
      return 'The metro network could not be loaded.'
    default:
      return ''
  }
}

/**
 * Compact toggle for the Metro network layer, like the layer buttons of other map apps. It shows or hides
 * stations and lines only; it never changes the route, the travel mode or the selected journey.
 */
export const MapMetroControl = memo(function MapMetroControl({ on, state, enabled, onToggle }: MapMetroControlProps) {
  const text = statusText(on, state)
  const failed = on && (state.status === 'error' || state.status === 'unavailable')
  return (
    <div className="map-metro-control">
      {text !== '' && (
        <span className="map-metro-control__status" role="status" data-metro-layer-status={state.status}>
          {text}
        </span>
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
