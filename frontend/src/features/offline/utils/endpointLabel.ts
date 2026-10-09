import { CURRENT_LOCATION_ORIGIN, type OfflineJourney } from '../types/offline.ts'

export const SAVED_PLACE_FALLBACK = 'Saved place'

/** The name shown for an end of a saved journey: the current-location word, the label while it is still allowed, else a plain fallback. */
export function endpointLabel(endpoint: OfflineJourney['origin']): string {
  if (endpoint === CURRENT_LOCATION_ORIGIN) return 'Current location'
  return endpoint.label ?? SAVED_PLACE_FALLBACK
}
