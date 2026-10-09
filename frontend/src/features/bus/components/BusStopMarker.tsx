import type { MapBusStop } from '../utils/mapBus.ts'
import './Bus.css'

interface BusStopMarkerProps {
  stop: MapBusStop
  selected: boolean
  /** Show the name beside the marker. */
  labelled: boolean
  /** The marker is part of the Bus layer while a journey is selected: drawn quieter. */
  muted?: boolean
  onSelect: (key: string) => void
}

const ROLE_LABEL: Record<MapBusStop['role'], string> = {
  network: 'Bus stop',
  journey: 'Stop on your journey',
  boarding: 'Boarding stop',
  transfer: 'Transfer stop',
  exit: 'Exit stop',
}

/** Short text shown for the stops that matter, so their role never relies on shape or colour alone. */
const ROLE_TAG: Partial<Record<MapBusStop['role'], string>> = {
  boarding: 'Board',
  transfer: 'Change',
  exit: 'Exit',
}

/**
 * One reusable bus-stop marker with a state per role: network stop, journey stop, boarding, transfer, exit. It is a real
 * button, so keyboard and screen-reader users can select a stop.
 */
export function BusStopMarker({ stop, selected, labelled, muted = false, onSelect }: BusStopMarkerProps) {
  const tag = ROLE_TAG[stop.role]
  return (
    <button
      type="button"
      className="bus-marker"
      data-role={stop.role}
      data-selected={selected}
      data-muted={muted}
      data-stop-key={stop.key}
      aria-label={`${stop.name}, ${ROLE_LABEL[stop.role].toLowerCase()}`}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(stop.key)
      }}
    >
      <span className="bus-marker__dot" aria-hidden="true" />
      {(labelled || tag !== undefined) && (
        <span className="bus-marker__label" aria-hidden="true">
          {tag !== undefined && <strong className="bus-marker__tag">{tag}</strong>}
          {(labelled || selected) && stop.name}
        </span>
      )}
    </button>
  )
}
