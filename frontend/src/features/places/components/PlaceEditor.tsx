import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { env } from '../../../config/env.ts'
import { LocationSearch } from '../../location/components/LocationSearch.tsx'
import type { LocationSelection } from '../../location/types/location.ts'
import { MAX_LABEL_LENGTH, PLACES_ERROR_MESSAGES, type PlacesError } from '../utils/placesData.ts'

interface PlaceEditorProps {
  title: string
  /** Custom places have a name of the person's choosing; Home and Work do not. */
  showLabel: boolean
  initialLabel: string
  /** A place must be chosen before saving (adding, or changing the place of a saved one). */
  showPlace: boolean
  /** Returns the reason the change was refused, or null when it was saved. */
  onSave: (label: string, place: LocationSelection | null) => PlacesError | null
  onCancel: () => void
}

/** One small form for adding a place, renaming it or pointing it at another place. */
export function PlaceEditor({ title, showLabel, initialLabel, showPlace, onSave, onCancel }: PlaceEditorProps) {
  const [label, setLabel] = useState(initialLabel)
  const [place, setPlace] = useState<LocationSelection | null>(null)
  const [error, setError] = useState<string | null>(null)
  const labelId = useId()
  const errorId = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (showPlace && place === null) {
      setError(PLACES_ERROR_MESSAGES.INVALID_PLACE)
      return
    }
    const failure = onSave(label, place)
    setError(failure === null ? null : PLACES_ERROR_MESSAGES[failure])
  }

  return (
    <form className="place-editor" aria-label={title} onSubmit={submit} noValidate>
      <h3 className="place-editor__title">{title}</h3>
      {showLabel && (
        <div className="place-editor__field">
          <label htmlFor={labelId} className="place-editor__label">
            Name
          </label>
          <input
            id={labelId}
            className="place-editor__input"
            type="text"
            value={label}
            maxLength={MAX_LABEL_LENGTH}
            placeholder="For example Gym or Mum's house"
            autoComplete="off"
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setLabel(event.target.value)
              setError(null)
            }}
          />
        </div>
      )}
      {showPlace &&
        (env.isGoogleMapsConfigured ? (
          <div className="place-editor__field">
            <span className="place-editor__label">Place</span>
            <LocationSearch
              label="Place"
              kind="search"
              placeholder="Search for the place"
              value={place}
              onChange={(next) => {
                setPlace(next)
                setError(null)
              }}
            />
          </div>
        ) : (
          <p className="places-panel__note" role="alert">
            Place search is unavailable because the Google Maps API key is not configured.
          </p>
        ))}
      <div aria-live="polite">
        {error !== null && (
          <p id={errorId} className="places-panel__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="place-editor__actions">
        <button type="submit" className="places-panel__primary">
          Save
        </button>
        <button type="button" className="places-panel__secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
