import { useCallback, useEffect, useRef, useState } from 'react'
import { CRITERIA, DEFAULT_PREFERENCES, type AccessibilityPreferences, type CriterionId, type TravelPreferences } from '../types/preferences.ts'
import { PREFERENCES_KEY, isDefaultPreferences, loadPreferences, normalizeAvoid, savePreferences } from '../utils/preferencesData.ts'
import type { TravelMode } from '../../route/types/travelMode.ts'

export interface PreferencesApi {
  preferences: TravelPreferences
  /** False when the browser would not keep the preferences; they then last until the page is closed. */
  persisted: boolean
  isDefault: boolean
  setPrefer: (id: CriterionId, on: boolean) => void
  setAvoid: (mode: TravelMode, on: boolean) => void
  setAccessibility: (id: keyof AccessibilityPreferences, on: boolean) => void
  reset: () => void
}

/**
 * The person's travel preferences, kept in this browser (versioned local storage; no account, no network).
 * Changing them only changes how the routes already calculated are ordered and filtered: it never requests routes.
 */
export function usePreferences(): PreferencesApi {
  const [preferences, setPreferences] = useState<TravelPreferences>(() => loadPreferences())
  const [persisted, setPersisted] = useState(true)
  const current = useRef(preferences)

  const commit = useCallback((next: TravelPreferences) => {
    current.current = next
    setPreferences(next)
    setPersisted(savePreferences(next))
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === PREFERENCES_KEY) {
        const next = loadPreferences()
        current.current = next
        setPreferences(next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setPrefer = useCallback(
    (id: CriterionId, on: boolean) => {
      if (!CRITERIA.some((criterion) => criterion.id === id) || current.current.prefer[id] === on) return
      commit({ ...current.current, prefer: { ...current.current.prefer, [id]: on } })
    },
    [commit],
  )
  const setAvoid = useCallback(
    (mode: TravelMode, on: boolean) => {
      const has = current.current.avoid.includes(mode)
      if (has === on) return
      commit({ ...current.current, avoid: normalizeAvoid(on ? [...current.current.avoid, mode] : current.current.avoid.filter((item) => item !== mode)) })
    },
    [commit],
  )
  const setAccessibility = useCallback(
    (id: keyof AccessibilityPreferences, on: boolean) => {
      if ((id !== 'stepFree' && id !== 'avoidInaccessible') || current.current.accessibility[id] === on) return
      commit({ ...current.current, accessibility: { ...current.current.accessibility, [id]: on } })
    },
    [commit],
  )
  const reset = useCallback(() => commit(DEFAULT_PREFERENCES), [commit])

  return { preferences, persisted, isDefault: isDefaultPreferences(preferences), setPrefer, setAvoid, setAccessibility, reset }
}
