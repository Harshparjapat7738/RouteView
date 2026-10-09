import { useCallback, useEffect, useRef, useState } from 'react'
import { loadOffline, saveOffline, WRITE_FAILURE_MESSAGES } from '../services/offlineStorage.ts'
import type { OfflineData, OfflineJourney } from '../types/offline.ts'
import { OFFLINE_CHANGE_MESSAGES, OFFLINE_STORAGE_KEY, addOfflineJourney, removeOfflineJourney, clearOfflineJourneys, normalizeOffline } from '../utils/offlineData.ts'

export type SaveOutcome = { ok: true } | { ok: false; message: string }

export interface OfflineJourneysApi {
  data: OfflineData
  /** Stored data that could not be read and was removed, or records left out; shown once, then dismissed. */
  notice: string | null
  dismissNotice: () => void
  save: (journey: OfflineJourney) => SaveOutcome
  remove: (id: string) => SaveOutcome
  clear: () => SaveOutcome
}

function initialNotice(result: ReturnType<typeof loadOffline>): string | null {
  if (result.discarded) return 'Saved offline journeys could not be read, so they were removed from this device.'
  if (result.dropped > 0) return `${result.dropped} saved ${result.dropped === 1 ? 'journey' : 'journeys'} could not be read and ${result.dropped === 1 ? 'was' : 'were'} removed.`
  return null
}

/**
 * Journeys kept for offline use, in this browser only. A change is written (and read back) before it is shown as done; if the
 * browser refuses, the list stays as it was and the message says why. Another tab's changes are picked up.
 */
export function useOfflineJourneys(): OfflineJourneysApi {
  const [state, setState] = useState(() => {
    const loaded = loadOffline()
    return { data: loaded.data, notice: initialNotice(loaded) }
  })
  const current = useRef(state.data)

  const apply = useCallback((next: OfflineData): SaveOutcome => {
    const written = saveOffline(next)
    if (!written.ok) return { ok: false, message: WRITE_FAILURE_MESSAGES[written.reason] }
    current.current = next
    setState((previous) => ({ ...previous, data: next }))
    return { ok: true }
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === OFFLINE_STORAGE_KEY) {
        const loaded = loadOffline()
        current.current = loaded.data
        setState({ data: loaded.data, notice: initialNotice(loaded) })
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Labels that expired while the page stayed open are not shown.
  useEffect(() => {
    const pruned = normalizeOffline(current.current, Date.now())
    if (JSON.stringify(pruned) !== JSON.stringify(current.current)) {
      current.current = pruned
      setState((previous) => ({ ...previous, data: pruned }))
    }
  }, [])

  const save = useCallback<OfflineJourneysApi['save']>(
    (journey) => {
      const change = addOfflineJourney(current.current, journey, Date.now())
      return change.ok ? apply(change.data) : { ok: false, message: OFFLINE_CHANGE_MESSAGES[change.error] }
    },
    [apply],
  )
  const remove = useCallback<OfflineJourneysApi['remove']>(
    (id) => {
      const change = removeOfflineJourney(current.current, id)
      return change.ok ? apply(change.data) : { ok: false, message: OFFLINE_CHANGE_MESSAGES[change.error] }
    },
    [apply],
  )
  const clear = useCallback<OfflineJourneysApi['clear']>(() => apply(clearOfflineJourneys()), [apply])
  const dismissNotice = useCallback(() => setState((previous) => ({ ...previous, notice: null })), [])

  return { data: state.data, notice: state.notice, dismissNotice, save, remove, clear }
}
