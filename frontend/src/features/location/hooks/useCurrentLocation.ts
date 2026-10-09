import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CurrentPositionError,
  describeCurrentPositionError,
  requestCurrentPosition,
  type CurrentPosition,
} from '../services/currentPosition.ts'

/** Browsers may never answer when the permission prompt is dismissed without a choice: stop waiting after this long. */
const NO_ANSWER_MS = 25_000

/** The current fix. `fixId` changes on every successful request, so a repeated click re-centres on the same spot. */
export interface LocatedPosition extends CurrentPosition {
  fixId: number
}

export type CurrentLocationState =
  | { status: 'idle'; position: LocatedPosition | null }
  | { status: 'locating'; position: LocatedPosition | null }
  | { status: 'error'; position: LocatedPosition | null; message: string }

export interface CurrentLocationApi {
  state: CurrentLocationState
  /** Requests the position once. Does nothing while a request is already running. */
  locate: () => void
  /** Removes the error message. */
  dismissError: () => void
}

/**
 * The device position on explicit request. One `getCurrentPosition` call per `locate()`, never tracking. The
 * position lives in component state only: it is not written to storage, the URL, a cache or any request.
 */
export function useCurrentLocation(): CurrentLocationApi {
  const [state, setState] = useState<CurrentLocationState>({ status: 'idle', position: null })
  const pending = useRef(false)
  const requestId = useRef(0)
  const fixes = useRef(0)
  const mounted = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(timer.current)
    }
  }, [])

  const locate = useCallback(() => {
    if (pending.current) {
      return
    }
    pending.current = true
    const id = ++requestId.current
    setState((current) => ({ status: 'locating', position: current.position }))

    const finish = (next: (previous: LocatedPosition | null) => CurrentLocationState) => {
      clearTimeout(timer.current)
      pending.current = false
      if (mounted.current) {
        setState((current) => next(current.position))
      }
    }

    timer.current = setTimeout(() => {
      // Give up waiting; an answer that arrives later is ignored.
      if (requestId.current === id && pending.current) {
        requestId.current++
        finish((position) => ({ status: 'error', position, message: describeCurrentPositionError('timeout') }))
      }
    }, NO_ANSWER_MS)

    requestCurrentPosition()
      .then((position) => {
        if (requestId.current !== id) {
          return
        }
        finish(() => ({ status: 'idle', position: { ...position, fixId: ++fixes.current } }))
      })
      .catch((error: unknown) => {
        if (requestId.current !== id) {
          return
        }
        const kind = error instanceof CurrentPositionError ? error.kind : 'unavailable'
        finish((position) => ({ status: 'error', position, message: describeCurrentPositionError(kind) }))
      })
  }, [])

  const dismissError = useCallback(() => {
    setState((current) => (current.status === 'error' ? { status: 'idle', position: current.position } : current))
  }, [])

  return { state, locate, dismissError }
}
