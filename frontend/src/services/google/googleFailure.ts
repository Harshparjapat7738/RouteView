import { ApiError } from '../api/ApiError.ts'

/** The Google-backed operations RouteView performs; used for messages and developer logs only. */
export type GoogleOperation = 'routeCalculation' | 'placeSuggestions' | 'placeDetails' | 'mapLoading'

/**
 * What went wrong, independent of which Google service reported it.
 *
 *  - network:           the browser could not reach the server
 *  - timeout:           no answer within the allowed time
 *  - unavailable:       temporary outage of the service (worth one more try)
 *  - quota:             a rate limit or quota was reached (retrying immediately does not help)
 *  - rejected:          the service refused the request (key, permission, billing, API disabled)
 *  - not-configured:    the server has no credentials configured
 *  - invalid-request:   the input cannot be used
 *  - invalid-response:  the answer was not in the expected format
 *  - unsupported-mode:  the provider has no route for the chosen travel mode here (the user can pick another mode)
 *  - unknown:           anything else
 */
export type FailureKind =
  | 'network'
  | 'timeout'
  | 'unavailable'
  | 'quota'
  | 'rejected'
  | 'not-configured'
  | 'invalid-request'
  | 'invalid-response'
  | 'unsupported-mode'
  | 'unknown'

/** A request to one of the Google-backed services failed. `message` is always safe to show to users. */
export class GoogleApiError extends Error {
  readonly kind: FailureKind
  readonly operation: GoogleOperation
  readonly status: number | null
  readonly code: string | null
  readonly retryable: boolean
  /** Whether trying the same request again can help (shown as a "Try again" action). */
  readonly canTryAgain: boolean

  constructor(kind: FailureKind, operation: GoogleOperation, status: number | null = null, code: string | null = null) {
    super(describeFailure(kind, operation))
    this.name = 'GoogleApiError'
    this.kind = kind
    this.operation = operation
    this.status = status
    this.code = code
    this.retryable = isAutomaticallyRetryable(kind)
    this.canTryAgain = kind !== 'invalid-request' && kind !== 'not-configured' && kind !== 'unsupported-mode'
  }
}

/** Thrown by the request policy when an attempt exceeds its time limit. */
export class RequestTimeoutError extends Error {
  constructor() {
    super('Request timed out')
    this.name = 'RequestTimeoutError'
  }
}

const NETWORK_MESSAGE = 'Unable to connect. Check your internet connection and try again.'
const TIMEOUT_MESSAGE = 'The request took too long. Please try again.'
const UNAVAILABLE_MESSAGE = 'The map service is temporarily unavailable. Please try again.'
const GENERIC_MESSAGE = 'The map service could not complete this request right now.'
const LOCATION_SEARCH_MESSAGE = 'Unable to search locations. Try entering a different location.'
const UNSUPPORTED_MODE_MESSAGE = "This travel mode isn't available for this journey. Please choose another one."
const ROUTE_INVALID_MESSAGE = "These locations can't be used for a route. Please choose different ones."

/** Understandable, non-technical text for a failure. Never contains provider details. */
export function describeFailure(kind: FailureKind, operation: GoogleOperation): string {
  switch (kind) {
    case 'network':
      return NETWORK_MESSAGE
    case 'timeout':
      return TIMEOUT_MESSAGE
    case 'unavailable':
      return UNAVAILABLE_MESSAGE
    case 'invalid-request':
      return operation === 'routeCalculation' ? ROUTE_INVALID_MESSAGE : LOCATION_SEARCH_MESSAGE
    case 'quota':
      return GENERIC_MESSAGE
    case 'unsupported-mode':
      return UNSUPPORTED_MODE_MESSAGE
    default:
      // Rejected, not configured, invalid or unknown: nothing the user can fix, no technical detail to show.
      return operation === 'placeSuggestions' || operation === 'placeDetails' ? LOCATION_SEARCH_MESSAGE : GENERIC_MESSAGE
  }
}

/** Only transient problems are retried automatically; quota, permission and input errors never are. */
export function isAutomaticallyRetryable(kind: FailureKind): boolean {
  return kind === 'network' || kind === 'unavailable'
}

const HTTP = { badRequest: 400, unauthorized: 401, forbidden: 403, tooManyRequests: 429, gatewayTimeout: 504, serverError: 500 }

/**
 * Sorts any thrown value into a FailureKind. Messages of foreign errors (for example the Maps JavaScript API)
 * are only inspected here to choose a category; they are never displayed or logged.
 */
export function classifyFailure(error: unknown): FailureKind {
  if (error instanceof GoogleApiError) {
    return error.kind
  }
  if (error instanceof RequestTimeoutError) {
    return 'timeout'
  }
  if (error instanceof ApiError) {
    return classifyApiError(error)
  }
  if (error instanceof SyntaxError || (error instanceof Error && error.name === 'RouteResponseError')) {
    return 'invalid-response'
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'network'
  }
  const text = error instanceof Error ? `${error.name} ${error.message}` : ''
  if (/RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|OVER_DAILY_LIMIT|quota|rate.?limit|too many requests/i.test(text)) {
    return 'quota'
  }
  if (/REQUEST_DENIED|PERMISSION_DENIED|not authori[sz]ed|api.?key|billing|ApiNotActivated|referer/i.test(text)) {
    return 'rejected'
  }
  if (/INVALID_ARGUMENT|INVALID_REQUEST/i.test(text)) {
    return 'invalid-request'
  }
  if (/failed to fetch|networkerror|network error|ERR_INTERNET|ERR_NETWORK|load failed/i.test(text)) {
    return 'network'
  }
  if (/UNAVAILABLE|UNKNOWN_ERROR|INTERNAL|DEADLINE_EXCEEDED|timed? ?out/i.test(text)) {
    return /timed? ?out|DEADLINE/i.test(text) ? 'timeout' : 'unavailable'
  }
  return 'unknown'
}

function classifyApiError(error: ApiError): FailureKind {
  switch (error.code) {
    case 'ROUTING_QUOTA':
      return 'quota'
    case 'ROUTING_TIMEOUT':
      return 'timeout'
    case 'ROUTING_NOT_CONFIGURED':
      return 'not-configured'
    case 'ROUTING_REJECTED':
      return 'rejected'
    case 'ROUTING_UNSUPPORTED_MODE':
      return 'unsupported-mode'
    case 'ROUTING_INVALID_RESPONSE':
      return 'invalid-response'
    case 'ROUTING_UNAVAILABLE':
      return 'unavailable'
  }
  const { status } = error
  if (status === 0) return 'network'
  if (status === HTTP.badRequest) return 'invalid-request'
  if (status === HTTP.tooManyRequests) return 'quota'
  if (status === HTTP.unauthorized || status === HTTP.forbidden) return 'rejected'
  if (status === HTTP.gatewayTimeout) return 'timeout'
  if (status >= HTTP.serverError) return 'unavailable'
  return 'unknown'
}

/** Wraps any thrown value into a GoogleApiError (a GoogleApiError is returned unchanged). */
export function toGoogleApiError(error: unknown, operation: GoogleOperation): GoogleApiError {
  if (error instanceof GoogleApiError) {
    return error
  }
  const status = error instanceof ApiError ? error.status : null
  const code = error instanceof ApiError ? error.code : null
  return new GoogleApiError(classifyFailure(error), operation, status, code)
}
