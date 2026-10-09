import { memo } from 'react'
import { env } from '../../../config/env.ts'
import { FloatingPanel } from '../../../ui/FloatingPanel.tsx'
import { RouteIcon } from '../../../ui/Icons.tsx'
import { PlacesButton } from '../../places/components/PlacesButton.tsx'
import type { LocationSelection } from '../types/location.ts'
import { LocationSearch } from './LocationSearch.tsx'
import './DestinationSearchBar.css'

interface DestinationSearchBarProps {
  destination: LocationSelection | null
  onChange: (location: LocationSelection | null) => void
  /** Changes when the "Choose destination" map control asks for the search to open. */
  focusSignal: number
  /** Opens the saved places and recent journeys panel. */
  onOpenPlaces?: () => void
}

const NOT_CONFIGURED_MESSAGE = 'Location search is unavailable because the Google Maps API key is not configured.'

/**
 * The floating address search bar: "Where do you want to go?". It uses the same Google Places search as every
 * other location field. Typed text is never a destination: one of the suggestions must be chosen. Editing or
 * clearing a chosen destination makes it "not selected" again (and the route configuration goes away with it).
 */
export const DestinationSearchBar = memo(function DestinationSearchBar({ destination, onChange, focusSignal, onOpenPlaces }: DestinationSearchBarProps) {
  return (
    <FloatingPanel className="search-bar" aria-label="Destination search">
      <span className="search-bar__logo" aria-hidden="true" title="RouteView">
        <RouteIcon width={18} height={18} />
      </span>
      {env.isGoogleMapsConfigured ? (
        <LocationSearch
          label="To"
          kind={destination ? 'destination' : 'search'}
          focusSignal={focusSignal}
          placeholder="Search an address or destination"
          value={destination}
          onChange={onChange}
        />
      ) : (
        <p className="search-bar__issue" role="alert">
          {NOT_CONFIGURED_MESSAGE}
        </p>
      )}
      {env.isGoogleMapsConfigured && onOpenPlaces && <PlacesButton onClick={onOpenPlaces} />}
    </FloatingPanel>
  )
})
