import { apiRequest } from '../../../services/api/httpClient.ts'
import { parseBusStopsInWindow, type BusStopsInWindow } from '../utils/parseBusStops.ts'

export type { BusStopsInWindow }

export interface BusWindow {
  south: number
  west: number
  north: number
  east: number
}

/** The bus stops inside a small map window (the Bus layer). The backend refuses large windows. */
export async function fetchBusStopsInWindow(window: BusWindow, signal: AbortSignal): Promise<BusStopsInWindow> {
  const query = new URLSearchParams({
    south: window.south.toFixed(6),
    west: window.west.toFixed(6),
    north: window.north.toFixed(6),
    east: window.east.toFixed(6),
  })
  const response = await apiRequest<unknown>(`/bus/stops/in-view?${query.toString()}`, { signal })
  return parseBusStopsInWindow(response)
}
