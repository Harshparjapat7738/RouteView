import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toGoogleApiError } from '../../../services/google/googleFailure.ts'
import { runWithPolicy } from '../../../services/google/requestPolicy.ts'
import type { RouteSession } from '../../route/types/routeSession.ts'
import type { LocationSelection } from '../../location/types/location.ts'
import type { SuggestionsState } from '../../location/hooks/useLocationSuggestions.ts'
import type { LocationSearchAvailability } from '../../location/hooks/useLocationSearchService.ts'
import { useLocationSearchService } from '../../location/hooks/useLocationSearchService.ts'
import { useLocationSuggestions } from '../../location/hooks/useLocationSuggestions.ts'
import { routePassesNearPoint } from '../../route/utils/routePointProximity.ts'

const SELECTION_TIMEOUT_MS = 8_000

export interface PassingAreaLocationSearch {
  selected: LocationSelection | null
  suggestions: SuggestionsState
  availability: LocationSearchAvailability
  resolving: boolean
  error: string | null
  matches: ReadonlySet<string>
  selectSuggestion: (suggestionId: string) => Promise<LocationSelection | null>
  clear: () => void
}

/**
 * Resolves a user-chosen Places suggestion and tests it against each route's own geometry.
 * The selection belongs to one calculated session and is never inferred from unselected text.
 */
export function usePassingAreaLocation(session: RouteSession | null, query: string) {
  const { service, availability } = useLocationSearchService()
  const [selectedRecord, setSelectedRecord] = useState<{ sessionId: string | null; location: LocationSelection } | null>(null)
  const [resolvingRecord, setResolvingRecord] = useState<{ sessionId: string | null; value: boolean } | null>(null)
  const [errorRecord, setErrorRecord] = useState<{ sessionId: string | null; message: string } | null>(null)
  const latestAction = useRef(0)
  const sessionId = session?.id ?? null
  const selected = selectedRecord?.sessionId === sessionId ? selectedRecord.location : null
  const resolving = resolvingRecord?.sessionId === sessionId && resolvingRecord.value
  const error = errorRecord?.sessionId === sessionId ? errorRecord.message : null

  useEffect(() => {
    latestAction.current++
  }, [sessionId])

  const suggestions = useLocationSuggestions(service, query, selected === null)
  const routes = session?.routes
  const matches = useMemo(() => {
    if (routes === undefined || selected === null) {
      return new Set<string>()
    }
    const point = { lat: selected.latitude, lng: selected.longitude }
    return new Set(routes.filter((route) => routePassesNearPoint(route, point)).map((route) => route.id))
  }, [routes, selected])

  const clear = useCallback(() => {
    latestAction.current++
    setSelectedRecord(null)
    setResolvingRecord({ sessionId, value: false })
    setErrorRecord(null)
  }, [sessionId])

  const selectSuggestion = useCallback(
    async (suggestionId: string): Promise<LocationSelection | null> => {
      if (service === null) {
        return null
      }
      const selectedSessionId = sessionId
      const action = ++latestAction.current
      setResolvingRecord({ sessionId: selectedSessionId, value: true })
      setErrorRecord(null)
      try {
        const location = await runWithPolicy(() => service.select(suggestionId), {
          operation: 'placeDetails',
          timeoutMs: SELECTION_TIMEOUT_MS,
          maxRetries: 1,
          retryDelayMs: 500,
        })
        if (action !== latestAction.current || selectedSessionId !== sessionId) {
          return null
        }
        setSelectedRecord({ sessionId: selectedSessionId, location })
        return location
      } catch (cause) {
        if (action === latestAction.current && selectedSessionId === sessionId) {
          setErrorRecord({ sessionId: selectedSessionId, message: toGoogleApiError(cause, 'placeDetails').message })
        }
        return null
      } finally {
        if (action === latestAction.current && selectedSessionId === sessionId) {
          setResolvingRecord({ sessionId: selectedSessionId, value: false })
        }
      }
    },
    [service, sessionId],
  )

  return { selected, suggestions, availability, resolving, error, matches, selectSuggestion, clear }
}
