import { memo } from 'react'
import { HistoryIcon } from '../../../ui/Icons.tsx'
import './Places.css'

interface PlacesButtonProps {
  onClick: () => void
  /** The compact variant sits inside a header or a search bar. */
  className?: string
}

/** Opens the Saved places and Recent journeys panel. Its only job is to be findable without cluttering the map. */
export const PlacesButton = memo(function PlacesButton({ onClick, className }: PlacesButtonProps) {
  return (
    <button
      type="button"
      className={`places-button${className ? ` ${className}` : ''}`}
      aria-label="Saved places and recent journeys"
      title="Saved places and recent journeys"
      data-places-open=""
      onClick={onClick}
    >
      <HistoryIcon width={22} height={22} />
    </button>
  )
})
