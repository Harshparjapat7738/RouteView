import type { LocationSelection } from '../../location/types/location.ts'
import type { TravelMode } from '../../route/types/travelMode.ts'
import { CURRENT_LOCATION, type JourneyEndpoint } from '../types/places.ts'

function endpoint(location: LocationSelection): JourneyEndpoint | null {
  return location.placeId ? { placeId: location.placeId, label: location.name.slice(0, 80) } : null
}

export interface JourneyRecord {
  origin: JourneyEndpoint | typeof CURRENT_LOCATION
  destination: JourneyEndpoint
  travelMode: TravelMode
}

/**
 * What a journey search leaves in the history: Place IDs and labels only. A current-location start becomes
 * `CURRENT_LOCATION` (its coordinates are dropped here). A place without a Place ID cannot be looked up again,
 * so such a journey is not recorded.
 */
export function toJourneyRecord(start: LocationSelection, destination: LocationSelection, travelMode: TravelMode): JourneyRecord | null {
  const to = endpoint(destination)
  const from = start.origin === 'CURRENT_LOCATION' ? CURRENT_LOCATION : endpoint(start)
  return from === null || to === null ? null : { origin: from, destination: to, travelMode }
}
