import { memo, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { env } from '../../../config/env.ts'
import { CloseIcon, LocateIcon, SwapIcon } from '../../../ui/Icons.tsx'
import type { LocationSelection } from '../types/location.ts'
import { validateLocationPair } from '../utils/locationValidation.ts'
import { PlacesButton } from '../../places/components/PlacesButton.tsx'
import { LocationSearch } from './LocationSearch.tsx'
import './DirectionsPanel.css'

interface DirectionsPanelProps {
  start: LocationSelection | null
  destination: LocationSelection | null
  onStartChange: (location: LocationSelection | null) => void
  onDestinationChange: (location: LocationSelection | null) => void
  /** Exchanges start and destination. */
  onSwap: () => void
  /** Closes the panel without changing the selected locations or route. */
  onClose: () => void
  onUseCurrentLocation: () => void
  /** Opens the saved places and recent journeys panel. */
  onOpenPlaces?: () => void
  locatingStart: boolean
  locateError: string | null
  /** Change when a field's value was set from outside it, so the field shows the new text. */
  startFieldKey: number
  destinationFieldKey: number
  /** Changes when the "Choose destination" map control asks for the destination field to be focused. */
  focusSignal: number
  onFindRoutes: () => void
  isFindingRoutes: boolean
  /** The travel mode selector, shown under the header. */
  modeSelector?: ReactNode
  /** The passing-area control, shown below Find Routes. */
  children?: ReactNode
}

const NOT_CONFIGURED_MESSAGE = 'Location search is unavailable because the Google Maps API key is not configured.'

/**
 * The route-planning panel: both fields, a swap button, a current-location shortcut, Find Routes and passing-area controls.
 */
export const DirectionsPanel = memo(function DirectionsPanel({
  start,
  destination,
  onStartChange,
  onDestinationChange,
  onSwap,
  onClose,
  onUseCurrentLocation,
  onOpenPlaces,
  locatingStart,
  locateError,
  startFieldKey,
  destinationFieldKey,
  focusSignal,
  onFindRoutes,
  isFindingRoutes,
  modeSelector,
  children,
}: DirectionsPanelProps) {
  const issueId = useId()
  const [submitted, setSubmitted] = useState(false)
  const issue = validateLocationPair(start, destination)
  const showIssue = issue !== null && (submitted || issue.kind === 'same-location' || issue.kind === 'invalid-location')

  function findRoutes() {
    setSubmitted(true)
    if (issue === null && !isFindingRoutes) {
      onFindRoutes()
    }
  }

  return (
    <section className="directions-panel location-panel" aria-label="Plan your route" data-map-overlay="">
      <header className="directions-panel__header">
        <h2 className="directions-panel__title">Plan your route</h2>
        <span className="directions-panel__header-actions">
          {env.isGoogleMapsConfigured && onOpenPlaces && <PlacesButton onClick={onOpenPlaces} />}
        <button type="button" className="directions-panel__close" aria-label="Close directions" onClick={onClose}>
          <CloseIcon width={22} height={22} />
        </button>
        </span>
      </header>

      {modeSelector}

      {env.isGoogleMapsConfigured ? (
        <div className="directions-panel__fields">
          <div className="directions-panel__inputs">
            <LocationSearch
              key={`start-${startFieldKey}`}
              label="From"
              kind="start"
              placeholder={locatingStart ? 'Locating you…' : 'Choose starting point'}
              value={start}
              onChange={(location) => {
                setSubmitted(false)
                onStartChange(location)
              }}
            />
            <LocationSearch
              key={`dest-${destinationFieldKey}`}
              label="To"
              kind="destination"
              focusSignal={focusSignal}
              placeholder="Choose destination"
              value={destination}
              onChange={(location) => {
                setSubmitted(false)
                onDestinationChange(location)
              }}
            />
          </div>
          <button type="button" className="directions-panel__swap" aria-label="Swap start and destination" onClick={onSwap}>
            <SwapIcon width={22} height={22} />
          </button>
        </div>
      ) : (
        <p className="location-panel__issue" role="alert">
          {NOT_CONFIGURED_MESSAGE}
        </p>
      )}

      <button
        type="button"
        className="directions-panel__here"
        aria-label="Use current location as start"
        aria-busy={locatingStart}
        aria-disabled={locatingStart}
        onClick={() => {
          if (!locatingStart) {
            onUseCurrentLocation()
          }
        }}
      >
        <span className="directions-panel__here-icon">
          <LocateIcon />
        </span>
        <span>{locatingStart ? 'Locating you…' : 'Use current location'}</span>
      </button>

      <div aria-live="polite">
        {locateError !== null && <p className="location-panel__issue location-panel__issue--locate">{locateError}</p>}
        {showIssue && (
          <p id={issueId} className="location-panel__issue">
            {issue.message}
          </p>
        )}
      </div>

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
    </section>
  )
})
