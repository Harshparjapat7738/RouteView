import { useRef, useState } from 'react'
import { useLocationSearchService } from '../hooks/useLocationSearchService.ts'
import { useLocationSuggestions } from '../hooks/useLocationSuggestions.ts'
import type { LocationSelection, LocationSuggestion } from '../types/location.ts'
import { toGoogleApiError } from '../../../services/google/googleFailure.ts'
import { runWithPolicy } from '../../../services/google/requestPolicy.ts'
import { LocationInput, MAX_QUERY_LENGTH } from './LocationInput.tsx'

interface LocationSearchProps {
  label: string
  kind?: 'start' | 'destination' | 'search'
  focusSignal?: number
  placeholder: string
  value: LocationSelection | null
  onChange: (location: LocationSelection | null) => void
}

const SERVICE_UNAVAILABLE_MESSAGE = 'Location search is currently unavailable. Please try again later.'
/** Resolving a chosen suggestion is a single user-initiated request: one quick retry for a lost connection. */
const SELECTION_TIMEOUT_MS = 8_000
const SELECTION_RETRY_DELAY_MS = 500

/**
 * One start/destination field: search text → suggestions → explicit selection.
 * Editing the text of a selected location resets it to "not selected".
 * Must render inside `GoogleMapsProvider` with an API key configured.
 */
export function LocationSearch({ label, kind, focusSignal, placeholder, value, onChange }: LocationSearchProps) {
  const { service, availability } = useLocationSearchService()
  const [text, setText] = useState(value?.name ?? '')
  const [resolving, setResolving] = useState(false)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  // Identifies the latest user action so that a slow, superseded selection is ignored.
  const latestAction = useRef(0)

  const suggestions = useLocationSuggestions(service, text, value === null)

  function handleTextChange(next: string) {
    latestAction.current += 1
    setResolving(false)
    setSelectionError(null)
    setText(next.slice(0, MAX_QUERY_LENGTH))
    if (value) {
      onChange(null)
    }
  }

  function handleClear() {
    handleTextChange('')
  }

  async function handleSelectSuggestion(suggestion: LocationSuggestion) {
    if (!service) {
      return
    }
    const action = ++latestAction.current
    setResolving(true)
    setSelectionError(null)
    try {
      const selection = await runWithPolicy(() => service.select(suggestion.id), {
        operation: 'placeDetails',
        timeoutMs: SELECTION_TIMEOUT_MS,
        maxRetries: 1,
        retryDelayMs: SELECTION_RETRY_DELAY_MS,
      })
      if (action !== latestAction.current) return
      setText(selection.name)
      onChange(selection)
    } catch (error) {
      if (action !== latestAction.current) return
      setSelectionError(toGoogleApiError(error, 'placeDetails').message)
    } finally {
      if (action === latestAction.current) setResolving(false)
    }
  }

  return (
    <LocationInput
      label={label}
      kind={kind}
      focusSignal={focusSignal}
      placeholder={availability === 'loading' ? 'Loading search...' : placeholder}
      text={text}
      selected={value !== null}
      disabled={availability !== 'ready'}
      resolving={resolving}
      suggestions={suggestions}
      errorMessage={availability === 'unavailable' ? SERVICE_UNAVAILABLE_MESSAGE : selectionError}
      onTextChange={handleTextChange}
      onSelectSuggestion={(suggestion) => void handleSelectSuggestion(suggestion)}
      onClear={handleClear}
    />
  )
}
