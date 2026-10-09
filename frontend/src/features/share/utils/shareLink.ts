import { isPlaceId } from '../../places/utils/placesData.ts'
import { isTravelMode, type TravelMode } from '../../route/types/travelMode.ts'

/**
 * The share link carries only what is needed to ask for the journey again: a version, the travel mode and Google Place IDs.
 * Never coordinates, names, route content, polylines, times, fares or anything about the sender.
 *
 *   https://host/?rv=1&m=METRO&o=<originPlaceId>&d=<destinationPlaceId>
 *
 * `o` is optional (a journey that starts at the sender's current location is shared without a start).
 */
export const SHARE_VERSION = '1'
export const SHARE_PARAMS = ['rv', 'm', 'o', 'd'] as const
const MAX_QUERY_LENGTH = 1500

export interface SharedJourney {
  travelMode: TravelMode
  originPlaceId: string | null
  destinationPlaceId: string
}

export type ParsedShare = { kind: 'none' } | { kind: 'invalid' } | { kind: 'ok'; share: SharedJourney }

export interface ShareLinkInput {
  travelMode: TravelMode
  originPlaceId?: string | null
  destinationPlaceId: string
}

/** Builds the link, or null when it cannot be made safely (an invalid Place ID is never put in a URL). */
export function buildShareLink(base: string, input: ShareLinkInput): string | null {
  if (!isTravelMode(input.travelMode) || !isPlaceId(input.destinationPlaceId)) return null
  if (input.originPlaceId != null && !isPlaceId(input.originPlaceId)) return null
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return null
  }
  const params = new URLSearchParams()
  params.set('rv', SHARE_VERSION)
  params.set('m', input.travelMode)
  if (input.originPlaceId != null) params.set('o', input.originPlaceId)
  params.set('d', input.destinationPlaceId)
  return `${url.origin}${url.pathname}?${params.toString()}`
}

/**
 * Reads a location's query string. Strict about the parameters it owns (a duplicate, an empty or malformed value makes the
 * link invalid) and blind to everything else, so an unrelated parameter never breaks a link or is ever acted on.
 */
export function parseShareLink(search: string): ParsedShare {
  if (search.length > MAX_QUERY_LENGTH) return { kind: 'invalid' }
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return { kind: 'invalid' }
  }
  if (!params.has('rv')) return { kind: 'none' }
  for (const key of SHARE_PARAMS) {
    if (params.getAll(key).length > 1) return { kind: 'invalid' }
  }
  if (params.get('rv') !== SHARE_VERSION) return { kind: 'invalid' }
  const mode = params.get('m')
  const destination = params.get('d')
  const origin = params.get('o')
  if (!isTravelMode(mode) || !isPlaceId(destination)) return { kind: 'invalid' }
  if (origin !== null && !isPlaceId(origin)) return { kind: 'invalid' }
  return { kind: 'ok', share: { travelMode: mode, originPlaceId: origin, destinationPlaceId: destination } }
}

/** The address without any share parameters (what the address bar shows once a link has been handled). */
export function withoutShareParams(pathname: string, search: string, hash: string): string {
  const params = new URLSearchParams(search)
  for (const key of SHARE_PARAMS) params.delete(key)
  const rest = params.toString()
  return `${pathname}${rest === '' ? '' : `?${rest}`}${hash}`
}
