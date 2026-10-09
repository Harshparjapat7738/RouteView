import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { SuggestionsState } from '../hooks/useLocationSuggestions.ts'
import type { LocationSuggestion } from '../types/location.ts'
import { CloseIcon, PinIcon, SearchIcon, StartDotIcon } from '../../../ui/Icons.tsx'
import './LocationInput.css'

export const MAX_QUERY_LENGTH = 200

interface LocationInputProps {
  label: string
  /** Which end of the trip this field is: decides the leading icon. */
  /** `search` is the empty destination search bar (magnifier); `destination` shows the confirmed pin. */
  kind?: 'start' | 'destination' | 'search'
  /** Changes when something else (a map control) asks this field to take focus. */
  focusSignal?: number
  placeholder: string
  text: string
  selected: boolean
  disabled: boolean
  /** True while a chosen suggestion is being resolved into a location. */
  resolving: boolean
  suggestions: SuggestionsState
  errorMessage: string | null
  onTextChange: (text: string) => void
  onSelectSuggestion: (suggestion: LocationSuggestion) => void
  onClear: () => void
}

const POPUP_MESSAGES = {
  loading: 'Searching...',
  empty: 'No locations found. Try a different name.',
  resolving: 'Getting location...',
} as const

/**
 * Accessible search field (ARIA combobox) that shows suggestions and reports the
 * user's choice. It holds no search logic and never treats typed text as a selection.
 */
export function LocationInput({
  label,
  kind,
  focusSignal = 0,
  placeholder,
  text,
  selected,
  disabled,
  resolving,
  suggestions,
  errorMessage,
  onTextChange,
  onSelectSuggestion,
  onClear,
}: LocationInputProps) {
  const baseId = useId()
  const inputId = `${baseId}-input`
  const listboxId = `${baseId}-listbox`
  const hintId = `${baseId}-hint`
  const errorId = `${baseId}-error`
  const inputRef = useRef<HTMLInputElement>(null)

  // Another control ("Choose destination") asked for focus: move it here.
  useEffect(() => {
    if (focusSignal > 0) {
      inputRef.current?.focus()
    }
  }, [focusSignal])

  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // The highlighted option belongs to one suggestion list; a new list starts with none highlighted.
  const [active, setActive] = useState({ forSuggestions: suggestions, index: -1 })
  const activeIndex = active.forSuggestions === suggestions ? active.index : -1
  const highlight = (index: number) => setActive({ forSuggestions: suggestions, index })

  const options = suggestions.status === 'ready' ? suggestions.suggestions : []
  const popupMessage = getPopupMessage(suggestions, resolving)
  const showPopup = focused && !dismissed && !selected && (resolving || suggestions.status !== 'idle')
  const showList = showPopup && !resolving && options.length > 0
  const activeId = showList && activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setDismissed(true)
      return
    }
    if (!showList) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      highlight((activeIndex + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      highlight(activeIndex <= 0 ? options.length - 1 : activeIndex - 1)
    } else if (event.key === 'Enter') {
      const active = options[activeIndex]
      if (active) {
        event.preventDefault()
        onSelectSuggestion(active)
      }
    }
  }

  return (
    <div className="location-input" data-kind={kind}>
      <label className="location-input__label sr-only" htmlFor={inputId}>
        {label}
      </label>
      <div className="location-input__control">
        {kind !== undefined && (
          <span className="location-input__icon" aria-hidden="true">
            {kind === 'start' ? (
              <StartDotIcon width={22} height={22} />
            ) : kind === 'search' ? (
              <SearchIcon width={22} height={22} />
            ) : (
              <PinIcon width={22} height={22} />
            )}
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          className={`location-input__field${selected ? ' location-input__field--selected' : ''}`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listboxId : undefined}
          aria-activedescendant={activeId}
          aria-describedby={errorMessage ? `${hintId} ${errorId}` : hintId}
          aria-busy={resolving}
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_QUERY_LENGTH}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onChange={(event) => {
            setDismissed(false)
            onTextChange(event.target.value)
          }}
          onFocus={() => {
            setFocused(true)
            setDismissed(false)
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
        />
        {text.length > 0 && !disabled && (
          <button
            type="button"
            className="location-input__clear"
            aria-label={`Clear ${label.toLowerCase()} location`}
            onClick={() => {
              onClear()
              inputRef.current?.focus()
            }}
          >
            <CloseIcon width={18} height={18} />
          </button>
        )}
        {showPopup && (
          // Keeps focus in the input while a suggestion is clicked.
          <div className="location-input__popup" onMouseDown={(event) => event.preventDefault()}>
            {showList ? (
              <ul id={listboxId} className="location-input__list" role="listbox" aria-label={`${label} suggestions`}>
                {options.map((option, index) => (
                  <li
                    key={option.id}
                    id={`${baseId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`location-input__option${index === activeIndex ? ' location-input__option--active' : ''}`}
                    onClick={() => onSelectSuggestion(option)}
                  >
                    <span className="location-input__primary">{option.primaryText}</span>
                    {option.secondaryText && (
                      <span className="location-input__secondary">{option.secondaryText}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="location-input__message" role="status">
                {popupMessage}
                {suggestions.status === 'error' && suggestions.retry !== null && (
                  <button type="button" className="location-input__retry" onClick={suggestions.retry}>
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <span id={hintId} className="sr-only">
        {selected ? 'Location selected.' : 'Type at least 3 characters, then choose a suggestion.'}
      </span>
      {errorMessage && (
        <p id={errorId} className="location-input__error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  )
}

function getPopupMessage(suggestions: SuggestionsState, resolving: boolean): string {
  if (resolving) return POPUP_MESSAGES.resolving
  if (suggestions.status === 'loading') return POPUP_MESSAGES.loading
  if (suggestions.status === 'error') return suggestions.message
  return POPUP_MESSAGES.empty
}
