import type { MapStation } from '../utils/mapMetro.ts'
import './Metro.css'

interface MetroStationMarkerProps {
  station: MapStation
  selected: boolean
  /** Show the name beside the marker. */
  labelled: boolean
  /** The marker belongs to a line the selected journey does not use. */
  muted?: boolean
  onSelect: (key: string) => void
}

const ROLE_LABEL: Record<MapStation['role'], string> = {
  network: 'Metro station',
  journey: 'Station on your journey',
  boarding: 'Boarding station',
  interchange: 'Interchange station',
  exit: 'Exit station',
}

/**
 * One reusable station marker with a state per role: normal, journey station, boarding, interchange, exit.
 * Roles differ by shape and size and by a text label for the key ones, not by colour alone. It is a real button,
 * so keyboard and screen-reader users can select a station.
 */
export function MetroStationMarker({ station, selected, labelled, muted = false, onSelect }: MetroStationMarkerProps) {
  const lines = station.lines.map((line) => line.label)
  const label = `${station.name}, ${ROLE_LABEL[station.role].toLowerCase()}${station.interchange && station.role === 'network' ? ', interchange' : ''}${lines.length > 0 ? `, ${lines.join(', ')}` : ''}`
  return (
    <button
      type="button"
      className="metro-marker"
      data-role={station.role}
      data-interchange={station.interchange}
      data-selected={selected}
      data-muted={muted}
      data-station-key={station.key}
      aria-label={label}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(station.key)
      }}
    >
      <span className="metro-marker__dot" aria-hidden="true" />
      {labelled && (
        <span className="metro-marker__label" aria-hidden="true">
          {station.name}
        </span>
      )}
    </button>
  )
}
