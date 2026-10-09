import type { MapBusStop } from './mapBus.ts'

export interface BusStopsInWindow {
  stops: readonly MapBusStop[]
  /** The window holds more stops than are listed; zooming in shows the rest. */
  truncated: boolean
}

const MAX_STOPS = 200

/** The Bus layer response is untrusted input: a malformed stop is dropped, a malformed body throws. */
export function parseBusStopsInWindow(value: unknown): BusStopsInWindow {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { stops?: unknown }).stops)) {
    throw new Error('Unexpected bus stops response')
  }
  const raw = value as { stops: unknown[]; truncated?: unknown }
  const stops: MapBusStop[] = []
  for (const item of raw.stops.slice(0, MAX_STOPS)) {
    if (typeof item !== 'object' || item === null) continue
    const { id, name, latitude, longitude } = item as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      id === '' ||
      typeof name !== 'string' ||
      name.trim() === '' ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      continue
    }
    stops.push({ key: id, name: name.trim().slice(0, 200), position: { lat: latitude, lng: longitude }, role: 'network' })
  }
  return { stops, truncated: raw.truncated === true }
}
