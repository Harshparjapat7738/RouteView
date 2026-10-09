import { memo, useEffect } from 'react'
import type { CurrentLocationState } from '../../location/hooks/useCurrentLocation.ts'
import { LocateIcon } from '../../../ui/Icons.tsx'
import { MapControlButton } from '../../../ui/MapControlButton.tsx'
import { CloseIcon } from '../../../ui/Icons.tsx'
import './MapLocateControl.css'

interface MapLocateControlProps {
  state: CurrentLocationState
  /** False until the map itself is ready. */
  enabled: boolean
  onLocate: () => void
  onDismissError: () => void
}

/** An error message stays this long (or until dismissed or the next attempt). */
const MESSAGE_MS = 8_000

/**
 * Floating "use my current location" button, bottom-right of the map. The browser asks for permission only when
 * this is pressed. While the request runs the button shows a spinner and a text status, and repeat presses are ignored.
 */
export const MapLocateControl = memo(function MapLocateControl({ state, enabled, onLocate, onDismissError }: MapLocateControlProps) {
  const locating = state.status === 'locating'
  const located = state.position !== null
  const errorMessage = state.status === 'error' ? state.message : null
  const visibleError = errorMessage

  // An error goes away by itself after a while.
  useEffect(() => {
    if (errorMessage === null) {
      return
    }
    const timer = window.setTimeout(onDismissError, MESSAGE_MS)
    return () => window.clearTimeout(timer)
  }, [errorMessage, onDismissError])

  const label = locating ? 'Finding your location' : 'Use my current location'

  return (
    <div className="map-locate">
      {visibleError !== null && (
        <div className="map-locate__message" role="alert">
          <span className="map-locate__message-icon" aria-hidden="true">
            !
          </span>
          <span className="map-locate__message-text">{visibleError}</span>
          <button type="button" className="map-locate__message-close" aria-label="Dismiss message" onClick={onDismissError}>
            <CloseIcon width={16} height={16} />
          </button>
        </div>
      )}
      <MapControlButton
        label={label}
        className="map-locate__button"
        tone={visibleError !== null ? 'error' : located ? 'active' : 'default'}
        aria-disabled={locating || !enabled}
        aria-busy={locating}
        data-state={locating ? 'locating' : visibleError !== null ? 'error' : located ? 'located' : 'idle'}
        onClick={() => {
          if (!locating && enabled) {
            onLocate()
          }
        }}
      >
        {locating ? <span className="map-locate__spinner" aria-hidden="true" /> : <LocateIcon filled={located} />}
      </MapControlButton>
      <span className="map-locate__status" role="status">
        {locating ? 'Finding your location...' : ''}
      </span>
    </div>
  )
})
