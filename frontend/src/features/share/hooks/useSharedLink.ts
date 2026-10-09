import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocationSearchService, LocationSelection } from '../../location/types/location.ts'
import type { TravelMode } from '../../route/types/travelMode.ts'
import { runWithPolicy } from '../../../services/google/requestPolicy.ts'
import { toGoogleApiError } from '../../../services/google/googleFailure.ts'
import { parseShareLink, withoutShareParams, type ParsedShare } from '../utils/shareLink.ts'

export interface OpenedShare {
  start: LocationSelection | null
  destination: LocationSelection
  travelMode: TravelMode
}

export type SharedLinkNotice =
  | { kind: 'invalid' }
  | { kind: 'offline' }
  | { kind: 'opening' }
  | { kind: 'failed'; message: string }
  | { kind: 'opened'; startMissing: boolean }

interface Options {
  online: boolean
  service: LocationSearchService | null
  /** The places service cannot load at all (no key, blocked): a shared link cannot be opened. */
  serviceUnavailable: boolean
  onOpen: (share: OpenedShare) => void
  /** Injectable for tests. */
  readLocation?: () => { pathname: string; search: string; hash: string }
}

const LOOKUP_TIMEOUT_MS = 10_000

function browserLocation() {
  return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }
}

/**
 * Opens a journey from a share link: validates the parameters, looks the places up again by Place ID (online only), hands
 * the inputs to the page, which calculates the routes afresh. Nothing from the link is trusted beyond its Place IDs and mode.
 * The link's parameters are removed from the address once handled.
 */
export function useSharedLink({ online, service, serviceUnavailable, onOpen, readLocation = browserLocation }: Options) {
  const [parsed] = useState<ParsedShare>(() => parseShareLink(readLocation().search))
  const [phase, setPhase] = useState<'idle' | 'invalid' | 'pending' | 'failed' | 'opened'>(() =>
    parsed.kind === 'ok' ? 'pending' : parsed.kind === 'invalid' ? 'invalid' : 'idle',
  )
  const [message, setMessage] = useState('')
  const [startMissing, setStartMissing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const openRef = useRef(onOpen)
  useEffect(() => {
    openRef.current = onOpen
  })

  const cleanAddress = useCallback(() => {
    const here = readLocation()
    const next = withoutShareParams(here.pathname, here.search, here.hash)
    if (next !== `${here.pathname}${here.search}${here.hash}`) {
      try {
        window.history.replaceState(window.history.state, '', next)
      } catch {
        // The address bar is cosmetic; failing to tidy it never matters.
      }
    }
  }, [readLocation])

  useEffect(() => {
    if (phase === 'invalid') cleanAddress()
  }, [phase, cleanAddress])

  useEffect(() => {
    if (phase !== 'pending' || parsed.kind !== 'ok') return
    if (serviceUnavailable) return
    if (!online || !service) return
    let cancelled = false
    const { share } = parsed
    const look = (placeId: string) =>
      runWithPolicy(() => service.resolve(placeId), { operation: 'placeDetails', timeoutMs: LOOKUP_TIMEOUT_MS, maxRetries: 1, retryDelayMs: 500 }).then(
        (found): LocationSelection => ({ ...found, placeId, name: found.name || 'Shared place' }),
      )
    void (async () => {
      try {
        const [start, destination] = await Promise.all([share.originPlaceId === null ? Promise.resolve(null) : look(share.originPlaceId), look(share.destinationPlaceId)])
        if (cancelled) return
        openRef.current({ start, destination, travelMode: share.travelMode })
        setStartMissing(start === null)
        setPhase('opened')
        cleanAddress()
      } catch (error) {
        if (cancelled) return
        setMessage(toGoogleApiError(error, 'placeDetails').message)
        setPhase('failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [phase, parsed, online, service, serviceUnavailable, attempt, cleanAddress])

  const retry = useCallback(() => {
    setPhase('pending')
    setAttempt((n) => n + 1)
  }, [])
  const dismiss = useCallback(() => {
    setPhase('idle')
    cleanAddress()
  }, [cleanAddress])

  let notice: SharedLinkNotice | null = null
  if (phase === 'invalid') notice = { kind: 'invalid' }
  else if (phase === 'pending' && serviceUnavailable) notice = { kind: 'failed', message: 'Place lookup is not available right now.' }
  else if (phase === 'pending') notice = online ? { kind: 'opening' } : { kind: 'offline' }
  else if (phase === 'failed') notice = { kind: 'failed', message }
  else if (phase === 'opened') notice = { kind: 'opened', startMissing }
  return { notice, retry, dismiss }
}
