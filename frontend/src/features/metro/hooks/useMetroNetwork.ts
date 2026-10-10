import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMetroNetwork } from '../services/metroApi.ts'
import type { MetroNetwork } from '../types/metro.ts'

export type MetroNetworkState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; network: MetroNetwork }
  /** No metro data has been imported on the server. */
  | { status: 'unavailable' }
  | { status: 'error' }

/**
 * Loads the static metro network once, the first time it is wanted (the Metro layer is switched on). It is the
 * same data for everyone, so a finished load is kept for the rest of the session and switching the layer off and
 * on never reloads it. A failed load is retried the next time the layer is switched on.
 */
export function useMetroNetwork(wanted: boolean): MetroNetworkState & { retry: () => void } {
  const [state, setState] = useState<MetroNetworkState>({ status: 'idle' })
  const [retryKey, setRetryKey] = useState(0)
  const finished = useRef(false)
  const started = useRef(false)

  useEffect(() => {
    if (!wanted || finished.current || started.current) {
      return
    }
    started.current = true
    const controller = new AbortController()
    // Starting a load is a state change in response to the layer being wanted, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'loading' })
    fetchMetroNetwork(controller.signal)
      .then((network) => {
        finished.current = true
        setState(network.dataset === null || network.stations.length === 0 ? { status: 'unavailable' } : { status: 'ready', network })
      })
      .catch((error: unknown) => {
        started.current = false
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          return
        }
        setState({ status: 'error' })
      })
    return () => {
      // Switching the layer off mid-load cancels it; a later switch-on starts again.
      if (!finished.current) {
        controller.abort()
        started.current = false
      }
    }
  }, [wanted, retryKey])

  const retry = useCallback(() => {
    if (state.status === 'error') {
      setRetryKey((key) => key + 1)
    }
  }, [state.status])

  return { ...state, retry }
}
