import { memo, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { env } from '../../../config/env.ts'
import { FloatingPanel } from '../../../ui/FloatingPanel.tsx'
import { LocateIcon } from '../../../ui/Icons.tsx'
import type { LocationSelection } from '../types/location.ts'
import { validateLocationPair } from '../utils/locationValidation.ts'
import { PlacesButton } from '../../places/components/PlacesButton.tsx'
import { LocationSearch } from './LocationSearch.tsx'
import './LocationPanel.css'

interface LocationPanelProps {
  start: LocationSelection | null
  destination: LocationSelection | null
  onStartChange: (location: LocationSelection | null) => void
  /** Uses the device position as the start (asks the browser only because the button was pressed). */
  onUseCurrentLocation: () => void
  /** Opens the saved places and recent journeys panel. */
  onOpenPlaces?: () => void
  /** The device position is being requested for the start. */
  locatingStart: boolean
  /** A reason the position could not be used, shown under the button; null without one. */
  locateError: string | null
  /** Changes when the start was set from outside the field, so the field shows the new text. */
  startFieldKey: number
  onFindRoutes: () => void
  isFindingRoutes: boolean
  /** The travel mode selector, shown above Find Routes. */
  modeSelector?: ReactNode
  /** The passing-area control, shown below Find Routes. */
  children?: ReactNode
}

const NOT_CONFIGURED_MESSAGE = 'Location search is unavailable because the Google Maps API key is not configured.'

/**
 * The route configuration that appears once a destination is chosen: where to start (a searched address or the
 * current location), Find Routes and, below, the passing-area control. The destination itself is chosen in the
 * search bar. "Find Routes" validates the pair, then asks the parent to calculate.
 */
export const LocationPanel = memo(function LocationPanel({
  start,
  destination,
  onStartChange,
  onUseCurrentLocation,
  onOpenPlaces,
  locatingStart,
  locateError,
  startFieldKey,
  onFindRoutes,
  isFindingRoutes,
  modeSelector,
  children,
}: LocationPanelProps) {
  const issueId = useId()
  const [submitted, setSubmitted] = useState(false)

  const issue = validateLocationPair(start, destination)
  const showIssue = issue !== null && (submitted || issue.kind === 'same-location' || issue.kind === 'invalid-location')

  function changeStart(location: LocationSelection | null) {
    setSubmitted(false)
    onStartChange(location)
  }

  function findRoutes() {
    setSubmitted(true)
    if (issue === null && !isFindingRoutes) {
      onFindRoutes()
    }
  }

  return (
    <FloatingPanel className="location-panel" aria-label="Plan your route">
      <div className="location-panel__heading">
        <h2 className="location-panel__title">Where are you starting from?</h2>
        {env.isGoogleMapsConfigured && onOpenPlaces && <PlacesButton onClick={onOpenPlaces} />}
      </div>
      {env.isGoogleMapsConfigured ? (
        <LocationSearch key={`start-${startFieldKey}`} label="From" kind="start" placeholder="Choose starting point" value={start} onChange={changeStart} />
      ) : (
        <p className="location-panel__issue" role="alert">
          {NOT_CONFIGURED_MESSAGE}
        </p>
      )}
      <button
        type="button"
        className="location-panel__here"
        aria-busy={locatingStart}
        aria-disabled={locatingStart}
        onClick={() => {
          if (!locatingStart) {
            onUseCurrentLocation()
          }
        }}
      >
        <LocateIcon />
        {locatingStart ? 'Finding your location...' : 'Use current location as start'}
      </button>
      <div aria-live="polite">
        {locateError !== null && <p className="location-panel__issue location-panel__issue--locate">{locateError}</p>}
        {showIssue && (
          <p id={issueId} className="location-panel__issue">
            {issue.message}
          </p>
        )}
      </div>

      {modeSelector}

      <button
        type="button"
        className="location-panel__submit"
        aria-disabled={issue !== null || isFindingRoutes}
        aria-describedby={showIssue ? issueId : undefined}
        aria-busy={isFindingRoutes}
        onClick={findRoutes}
      >
        {isFindingRoutes && <span className="location-panel__spinner" aria-hidden="true" />}
        {isFindingRoutes ? 'Finding routes...' : 'Find Routes'}
      </button>
      {children}
    </FloatingPanel>
  )
})
