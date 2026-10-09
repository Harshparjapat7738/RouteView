/** Why a current-location request failed, in terms RouteView understands (never the raw browser error). */
export type CurrentPositionErrorKind = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure'

export interface CurrentPosition {
  latitude: number
  longitude: number
  /** Radius of the browser's confidence circle in metres, when it reports one. */
  accuracyMeters: number | null
}

export class CurrentPositionError extends Error {
  readonly kind: CurrentPositionErrorKind

  constructor(kind: CurrentPositionErrorKind) {
    super(kind)
    this.name = 'CurrentPositionError'
    this.kind = kind
  }
}

/** One accurate fix, not a stream: a modest timeout and a short cache so a repeated click really refreshes. */
export const CURRENT_POSITION_OPTIONS: PositionOptions = Object.freeze({
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 10_000,
})

/** The subset of `navigator.geolocation` used here, so it can be replaced in tests. */
export interface GeolocationLike {
  getCurrentPosition(
    success: (position: GeolocationPosition) => void,
    failure: (error: GeolocationPositionError) => void,
    options?: PositionOptions,
  ): void
}

// GeolocationPositionError codes (PERMISSION_DENIED = 1, POSITION_UNAVAILABLE = 2, TIMEOUT = 3).
const PERMISSION_DENIED = 1
const TIMEOUT = 3

function toKind(code: number): CurrentPositionErrorKind {
  if (code === PERMISSION_DENIED) {
    return 'denied'
  }
  return code === TIMEOUT ? 'timeout' : 'unavailable'
}

function isValid(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}

/**
 * False only when the browser says the page is not a secure context (plain HTTP on a non-loopback address, for
 * example). Browsers refuse geolocation there whatever the permission, so asking would only produce a misleading
 * "blocked" answer. When the browser does not report it (very old engines) the request goes ahead as before.
 */
function isSecureOrUnknown(): boolean {
  return typeof globalThis.isSecureContext !== 'boolean' || globalThis.isSecureContext
}

/**
 * Asks the browser for the device's position once. Uses the Geolocation API only (no Google service) and never
 * `watchPosition`. The result is returned to the caller and not stored anywhere.
 */
export function requestCurrentPosition(
  geolocation: GeolocationLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation,
  options: PositionOptions = CURRENT_POSITION_OPTIONS,
): Promise<CurrentPosition> {
  return new Promise((resolve, reject) => {
    if (!isSecureOrUnknown()) {
      reject(new CurrentPositionError('insecure'))
      return
    }
    if (!geolocation) {
      reject(new CurrentPositionError('unsupported'))
      return
    }
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => {
          if (!isValid(coords.latitude, coords.longitude)) {
            reject(new CurrentPositionError('unavailable'))
            return
          }
          resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyMeters: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
          })
        },
        (error) => reject(new CurrentPositionError(toKind(error.code))),
        options,
      )
    } catch {
      reject(new CurrentPositionError('unsupported'))
    }
  })
}

const MESSAGES: Record<CurrentPositionErrorKind, string> = {
  denied: 'Location access is blocked. Allow it in your browser settings to use your current location.',
  unavailable: 'Your location could not be determined. Please try again.',
  timeout: 'Finding your location took too long. Please try again.',
  unsupported: 'Your browser or device does not support location.',
  insecure: 'Location only works on a secure page. Open RouteView over HTTPS, or on localhost, to use it.',
}

/** A short, user-facing sentence for a failure. */
export function describeCurrentPositionError(kind: CurrentPositionErrorKind): string {
  return MESSAGES[kind]
}
