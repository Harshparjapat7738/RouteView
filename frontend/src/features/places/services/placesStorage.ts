import { EMPTY_PLACES, STORAGE_KEY, parsePlaces, serializePlaces } from '../utils/placesData.ts'
import type { PlacesData } from '../types/places.ts'

/** The part of `Storage` this feature uses; tests pass a fake. */
export type PlacesBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): PlacesBackend | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    // Blocked storage (private mode, policy) throws on access.
    return null
  }
}

/** Reads the saved places and recent journeys. Never throws: unreadable storage gives empty data and is cleaned up. */
export function loadPlaces(now: number = Date.now(), backend: PlacesBackend | null = browserStorage()): PlacesData {
  if (backend === null) return EMPTY_PLACES
  try {
    const outcome = parsePlaces(backend.getItem(STORAGE_KEY), now)
    if (outcome.status === 'discarded') {
      backend.removeItem(STORAGE_KEY)
    }
    return outcome.data
  } catch {
    return EMPTY_PLACES
  }
}

/** Writes the data; false when the browser refused (full or blocked storage), so the page can say it is not kept. */
export function savePlaces(data: PlacesData, backend: PlacesBackend | null = browserStorage()): boolean {
  if (backend === null) return false
  try {
    if (data.saved.length === 0 && data.recent.length === 0) {
      backend.removeItem(STORAGE_KEY)
    } else {
      backend.setItem(STORAGE_KEY, serializePlaces(data))
    }
    return true
  } catch {
    return false
  }
}
