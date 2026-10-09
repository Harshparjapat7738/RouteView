import { useCallback, useEffect, useRef, useState } from 'react'
import { loadPlaces, savePlaces } from '../services/placesStorage.ts'
import type { JourneyEndpoint, PlacesData, RecentJourney, SavedPlaceKind } from '../types/places.ts'
import type { CURRENT_LOCATION } from '../types/places.ts'
import {
  type Change,
  addSavedPlace,
  clearRecentJourneys,
  normalizePlaces,
  recordRecentJourney,
  removeRecentJourney,
  removeSavedPlace,
  updateSavedPlace,
} from '../utils/placesData.ts'
import { STORAGE_KEY } from '../utils/placesData.ts'

export interface PlacesApi {
  data: PlacesData
  /** False when the browser would not keep the data: it then lives only until the page is closed. */
  persisted: boolean
  addSaved: (input: { kind: SavedPlaceKind; label?: string; placeId: string }) => Change
  updateSaved: (id: string, patch: { label?: string; placeId?: string }) => Change
  removeSaved: (id: string) => void
  recordJourney: (input: { origin: JourneyEndpoint | typeof CURRENT_LOCATION; destination: JourneyEndpoint; travelMode: RecentJourney['travelMode'] }) => void
  removeRecent: (id: string) => void
  clearRecent: () => void
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/**
 * The person's saved places and recent journeys, kept in this browser (versioned local storage, no account).
 * Changes are written at once; a change made in another tab is picked up. Never touches the network.
 */
export function usePlaces(): PlacesApi {
  const [data, setData] = useState<PlacesData>(() => loadPlaces())
  const [persisted, setPersisted] = useState(true)
  const current = useRef(data)

  const commit = useCallback((next: PlacesData) => {
    current.current = next
    setData(next)
    setPersisted(savePlaces(next))
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === STORAGE_KEY) {
        const next = loadPlaces()
        current.current = next
        setData(next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const addSaved = useCallback<PlacesApi['addSaved']>(
    (input) => {
      const change = addSavedPlace(current.current, input, newId(), Date.now())
      if (change.ok) commit(change.data)
      return change
    },
    [commit],
  )
  const updateSaved = useCallback<PlacesApi['updateSaved']>(
    (id, patch) => {
      const change = updateSavedPlace(current.current, id, patch, Date.now())
      if (change.ok) commit(change.data)
      return change
    },
    [commit],
  )
  const removeSaved = useCallback((id: string) => commit(removeSavedPlace(current.current, id)), [commit])
  const recordJourney = useCallback<PlacesApi['recordJourney']>(
    (input) => commit(recordRecentJourney(current.current, input, newId(), Date.now())),
    [commit],
  )
  const removeRecent = useCallback((id: string) => commit(removeRecentJourney(current.current, id)), [commit])
  const clearRecent = useCallback(() => commit(clearRecentJourneys(current.current)), [commit])

  // Records that expired while the page stayed open are not shown.
  useEffect(() => {
    const pruned = normalizePlaces(current.current, Date.now())
    if (pruned.recent.length !== current.current.recent.length) commit(pruned)
  }, [commit])

  return { data, persisted, addSaved, updateSaved, removeSaved, recordJourney, removeRecent, clearRecent }
}
