import { useRef, type KeyboardEvent } from 'react'
import { TRAVEL_MODE_ICONS } from './travelModeIcons.ts'
import { LIMITED_COVERAGE_WARNING, TRAVEL_MODES, TRAVEL_MODE_INFO, type TravelMode } from '../types/travelMode.ts'
import './TravelModeSelector.css'

export interface TravelModeSelectorProps {
  value: TravelMode
  /** Choosing a mode only updates the search state: it never requests anything. */
  onChange: (mode: TravelMode) => void
  /** `floating`: over the map, before a destination is chosen. `inline`: inside the directions / location panel. */
  variant: 'floating' | 'inline'
  /** Modes known to have no route for the current journey, with the reason shown to the user. */
  unavailable?: Readonly<Partial<Record<TravelMode, string>>>
  /** The mode was changed after routes had been calculated: they are gone and need recalculating. */
  stale?: boolean
  disabled?: boolean
}

/**
 * Compact travel mode picker (radio group of icon buttons, Google Maps style). Arrow keys move the choice;
 * Home / End jump to the first / last mode. Unavailable modes are dimmed and cannot be chosen.
 */
export function TravelModeSelector({ value, onChange, variant, unavailable = {}, stale = false, disabled = false }: TravelModeSelectorProps) {
  const refs = useRef(new Map<TravelMode, HTMLButtonElement>())
  const info = TRAVEL_MODE_INFO[value]
  const selectedProblem = unavailable[value]

  function choose(mode: TravelMode) {
    if (!disabled && mode !== value && unavailable[mode] === undefined) {
      onChange(mode)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!forward && !backward && event.key !== 'Home' && event.key !== 'End') {
      return
    }
    event.preventDefault()
    // Candidates in the order they should be tried; unavailable modes are skipped.
    const count = TRAVEL_MODES.length
    const from = TRAVEL_MODES.indexOf(value)
    const order = TRAVEL_MODES.map((_, i) => {
      if (event.key === 'Home') return i
      if (event.key === 'End') return count - 1 - i
      return (from + (forward ? 1 : -1) * (i + 1) + count * count) % count
    })
    for (const index of order) {
      const mode = TRAVEL_MODES[index] ?? value
      if (unavailable[mode] === undefined) {
        choose(mode)
        refs.current.get(mode)?.focus()
        return
      }
    }
  }

  let caption: string
  let captionKind: 'problem' | 'stale' | 'warning' | 'plain' = 'plain'
  if (selectedProblem !== undefined) {
    caption = `${info.label} — ${selectedProblem}`
    captionKind = 'problem'
  } else if (stale) {
    caption = `${info.label} selected. Press Find Routes to update the routes.`
    captionKind = 'stale'
  } else if (info.limitedCoverage) {
    caption = `${info.label}. ${LIMITED_COVERAGE_WARNING}`
    captionKind = 'warning'
  } else {
    caption = info.label
  }

  return (
    <div className={`travel-mode travel-mode--${variant}`} data-map-overlay={variant === 'floating' ? '' : undefined} data-travel-mode-selector="">
      <div className="travel-mode__group" role="radiogroup" aria-label="Travel mode" onKeyDown={onKeyDown}>
        {TRAVEL_MODES.map((mode) => {
          const Icon = TRAVEL_MODE_ICONS[mode]
          const label = TRAVEL_MODE_INFO[mode].label
          const problem = unavailable[mode]
          const selected = mode === value
          return (
            <button
              key={mode}
              ref={(node) => {
                if (node) refs.current.set(mode, node)
                else refs.current.delete(mode)
              }}
              type="button"
              role="radio"
              className="travel-mode__option"
              aria-checked={selected}
              aria-label={problem === undefined ? label : `${label} — ${problem}`}
              aria-disabled={disabled || (problem !== undefined && !selected) || undefined}
              data-mode={mode}
              data-unavailable={problem !== undefined ? '' : undefined}
              title={problem === undefined ? label : `${label} — ${problem}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(mode)}
            >
              <Icon width={22} height={22} />
            </button>
          )
        })}
      </div>
      <p className={`travel-mode__caption travel-mode__caption--${captionKind}`} data-travel-mode-caption="" aria-live="polite">
        {caption}
      </p>
    </div>
  )
}
