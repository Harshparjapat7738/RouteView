import { useEffect, useState } from 'react'
import { fetchBusStopsInWindow, type BusStopsInWindow, type BusWindow } from '../services/busApi.ts'

export type BusStopsState =
  | { status: 'off' }
  /** The layer is on but the map is too far out to show stops. */
  | { status: 'zoom-in' }
  | { status: 'loading'; previous: BusStopsInWindow | null }
  | { status: 'ready'; data: BusStopsInWindow }
  | { status: 'error'; previous: BusStopsInWindow | null }

const DEBOUNCE_MS = 300

/**
 * Loads the bus stops of the window the map shows, only while the Bus layer is on and the map is zoomed in. A new window
 * cancels the previous request, and moving the map around never fires one request per frame (it waits until it settles).
 */
export function useBusStops(layerOn: boolean, zoomedIn: boolean, window: BusWindow | null): BusStopsState {
  const [result, setResult] = useState<{ window: BusWindow; state: 'loading' | 'ready' | 'error'; data: BusStopsInWindow | null } | null>(null)
  const active = layerOn && zoomedIn && window !== null
  const south = window?.south
  const west = window?.west
  const north = window?.north
  const east = window?.east

  useEffect(() => {
    if (!active || south === undefined || west === undefined || north === undefined || east === undefined) {
      return
    }
    const area = { south, west, north, east }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setResult((current) => ({ window: area, state: 'loading', data: current?.data ?? null }))
      fetchBusStopsInWindow(area, controller.signal)
        .then((data) => setResult({ window: area, state: 'ready', data }))
        .catch((error: unknown) => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
          setResult((current) => ({ window: area, state: 'error', data: current?.data ?? null }))
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [active, south, west, north, east])

  if (!layerOn) return { status: 'off' }
  if (!zoomedIn) return { status: 'zoom-in' }
  if (result === null) return { status: 'loading', previous: null }
  if (result.state === 'ready' && result.data !== null) return { status: 'ready', data: result.data }
  return result.state === 'error' ? { status: 'error', previous: result.data } : { status: 'loading', previous: result.data }
}
