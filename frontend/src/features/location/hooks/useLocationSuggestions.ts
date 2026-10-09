import { useCallback, useEffect, useState } from 'react'
import { toGoogleApiError } from '../../../services/google/googleFailure.ts'
import { runWithPolicy } from '../../../services/google/requestPolicy.ts'
import type { LocationSearchService, LocationSuggestion } from '../types/location.ts'
import { useDebouncedValue } from './useDebouncedValue.ts'

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 3
/** Typing again is the retry for suggestions, so no automatic retry; just do not wait forever. */
const SUGGESTION_TIMEOUT_MS = 8_000

export type SuggestionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; suggestions: LocationSuggestion[] }
  /** `retry` repeats the search for the same text; absent when repeating cannot help. */
  | { status: 'error'; message: string; retry: (() => void) | null }

type SearchResult =
  | { status: 'ready'; suggestions: LocationSuggestion[] }
  | { status: 'error'; message: string; canTryAgain: boolean }

const IDLE: SuggestionsState = { status: 'idle' }
const LOADING: SuggestionsState = { status: 'loading' }

/**
 * Fetches suggestions for `query`: debounced, skipped for short input and when `enabled` is false.
 * Only the answer for the text currently typed is ever shown: a response that arrives after the user has
 * typed more (or after the field was disabled) is discarded and its request cancelled.
 */
export function useLocationSuggestions(
  service: LocationSearchService | null,
  query: string,
  enabled: boolean,
): SuggestionsState {
  const trimmed = query.trim()
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS)
  const searchable = enabled && service !== null && trimmed.length >= MIN_QUERY_LENGTH
  const [settled, setSettled] = useState<{ query: string; result: SearchResult } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!service || !enabled || debounced.length < MIN_QUERY_LENGTH) {
      return
    }
    const controller = new AbortController()
    runWithPolicy(() => service.suggest(debounced), {
      operation: 'placeSuggestions',
      timeoutMs: SUGGESTION_TIMEOUT_MS,
      maxRetries: 0,
      retryDelayMs: 0,
      signal: controller.signal,
    })
      .then((suggestions) => {
        if (!controller.signal.aborted) setSettled({ query: debounced, result: { status: 'ready', suggestions } })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const failure = toGoogleApiError(error, 'placeSuggestions')
        setSettled({ query: debounced, result: { status: 'error', message: failure.message, canTryAgain: failure.canTryAgain } })
      })
    return () => controller.abort()
  }, [service, enabled, debounced, attempt])

  const retry = useCallback(() => {
    setSettled(null)
    setAttempt((value) => value + 1)
  }, [])

  if (!searchable) {
    return IDLE
  }
  // Results only count for the exact text currently typed; otherwise they are still on their way.
  if (settled?.query !== trimmed) {
    return LOADING
  }
  const { result } = settled
  return result.status === 'ready'
    ? result
    : { status: 'error', message: result.message, retry: result.canTryAgain ? retry : null }
}
