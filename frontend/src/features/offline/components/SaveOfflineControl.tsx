import { useId, useMemo, useState } from 'react'
import type { LocationSelection } from '../../location/types/location.ts'
import type { TravelPreferences } from '../../preferences/types/preferences.ts'
import type { Route } from '../../route/types/route.ts'
import type { TravelMode } from '../../route/types/travelMode.ts'
import type { OfflineJourneysApi } from '../hooks/useOfflineJourneys.ts'
import { findSaved } from '../utils/offlineData.ts'
import { BUILD_ERROR_MESSAGES, buildOfflineJourney } from '../utils/buildOffline.ts'
import { datasetChanged } from '../utils/freshness.ts'
import { MAX_OFFLINE_JOURNEYS, itineraryAllowed } from '../utils/offlinePolicy.ts'
import './Offline.css'

interface SaveOfflineControlProps {
  route: Route | null
  travelMode: TravelMode
  start: LocationSelection | null
  destination: LocationSelection | null
  preferences: TravelPreferences
  offline: OfflineJourneysApi
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/**
 * Explicit Save / Update / Remove for the journey on screen. A Bus journey keeps its stop sequence on this device; every other
 * journey keeps only its places, mode and preferences (Google route content may not be stored). Nothing is saved automatically.
 */
export function SaveOfflineControl({ route, travelMode, start, destination, preferences, offline }: SaveOfflineControlProps) {
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const captionId = useId()
  const probe = useMemo(
    () => buildOfflineJourney({ start, destination, travelMode, route, preferences, id: 'probe', now: 0 }),
    [start, destination, travelMode, route, preferences],
  )
  const saved = probe.ok ? findSaved(offline.data, probe.journey) : null
  const full = saved === null && offline.data.journeys.length >= MAX_OFFLINE_JOURNEYS
  const fullItinerary = itineraryAllowed(travelMode) && travelMode === 'BUS'
  const newer = saved !== null && route?.bus !== undefined ? datasetChanged(saved, route.bus.datasetVersion) : null

  function persist(kind: 'saved' | 'updated') {
    const built = buildOfflineJourney({ start, destination, travelMode, route, preferences, id: saved?.id ?? newId(), now: Date.now() })
    if (!built.ok) {
      setStatus({ text: BUILD_ERROR_MESSAGES[built.error], error: true })
      return
    }
    const outcome = offline.save({ ...built.journey, id: saved?.id ?? built.journey.id })
    if (!outcome.ok) {
      setStatus({ text: outcome.message, error: true })
      return
    }
    const detail = built.journey.itinerary !== null ? 'with its stop sequence' : 'as places and travel mode only'
    setStatus({ text: kind === 'saved' ? `Saved on this device ${detail}.` : `Saved copy updated ${detail}.`, error: false })
  }

  function remove() {
    if (saved === null) return
    const outcome = offline.remove(saved.id)
    setStatus(outcome.ok ? { text: 'Removed from this device.', error: false } : { text: outcome.message, error: true })
  }

  const canSave = probe.ok && route !== null
  return (
    <div className="offline-save" data-offline-save="">
      <div className="offline-save__row">
        {saved === null ? (
          <button type="button" className="offline-save__button" disabled={!canSave || full} aria-describedby={captionId} onClick={() => persist('saved')}>
            Save for offline
          </button>
        ) : (
          <>
            <span className="offline-save__state" data-offline-saved="">
              Saved offline
            </span>
            <button type="button" className="offline-save__button" aria-describedby={captionId} onClick={() => persist('updated')}>
              Update saved copy
            </button>
            <button type="button" className="offline-save__button offline-save__button--danger" onClick={remove}>
              Remove
            </button>
          </>
        )}
      </div>
      <p className="offline-save__caption" id={captionId}>
        {!probe.ok
          ? BUILD_ERROR_MESSAGES[probe.error]
          : full
            ? `You can keep up to ${MAX_OFFLINE_JOURNEYS} journeys offline. Remove one in Saved & recent to save another.`
            : fullItinerary
              ? 'Keeps the bus and stop sequence, with its data version, on this device only.'
              : 'Keeps only the places, travel mode and preferences: directions come from Google and need a connection.'}
        {newer === true && saved !== null ? ' This journey uses newer transit data than the saved copy.' : ''}
      </p>
      <p className="offline-save__status" role={status?.error ? 'alert' : 'status'}>
        {status?.text ?? ''}
      </p>
    </div>
  )
}
