import type { LocationSelection } from '../types/location.ts'

export type LocationValidationIssueKind =
  | 'missing-start'
  | 'missing-destination'
  | 'invalid-location'
  | 'same-location'

export interface LocationValidationIssue {
  kind: LocationValidationIssueKind
  message: string
}

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

function hasValidCoordinates(location: LocationSelection): boolean {
  return isValidCoordinate(location.latitude, location.longitude)
}

/** Returns the first problem that prevents using the pair, or `null` when it is usable. */
export function validateLocationPair(
  start: LocationSelection | null,
  destination: LocationSelection | null,
): LocationValidationIssue | null {
  if (!start) {
    return { kind: 'missing-start', message: 'Please select a start location from the suggestions.' }
  }
  if (!destination) {
    return { kind: 'missing-destination', message: 'Please select a destination from the suggestions.' }
  }
  if (!hasValidCoordinates(start) || !hasValidCoordinates(destination)) {
    return { kind: 'invalid-location', message: 'A selected location is not valid. Please choose another.' }
  }
  if (start.latitude === destination.latitude && start.longitude === destination.longitude) {
    return { kind: 'same-location', message: 'Start and destination must be different.' }
  }
  return null
}
