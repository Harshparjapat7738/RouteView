import { APILoadingStatus, useApiLoadingStatus, useMapsLibrary } from '@vis.gl/react-google-maps'
import { useMemo } from 'react'
import { createGooglePlacesSearch } from '../services/googlePlacesSearch.ts'
import type { LocationSearchService } from '../types/location.ts'

export type LocationSearchAvailability = 'loading' | 'ready' | 'unavailable'

interface LocationSearchServiceState {
  service: LocationSearchService | null
  availability: LocationSearchAvailability
}

/**
 * Provides a location search service backed by the already-loaded Google Maps API.
 * Each caller gets its own service instance (own session token and suggestions).
 * Must run inside `GoogleMapsProvider` with an API key configured.
 */
export function useLocationSearchService(): LocationSearchServiceState {
  const places = useMapsLibrary('places')
  const status = useApiLoadingStatus()
  const service = useMemo(() => (places ? createGooglePlacesSearch(places) : null), [places])

  if (service) {
    return { service, availability: 'ready' }
  }
  const failed = status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE
  return { service: null, availability: failed ? 'unavailable' : 'loading' }
}
