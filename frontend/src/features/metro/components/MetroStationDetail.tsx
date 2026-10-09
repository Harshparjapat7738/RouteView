import { useEffect, useRef } from 'react'
import { CloseIcon } from '../../../ui/Icons.tsx'
import type { MapStation } from '../utils/mapMetro.ts'
import type { StationLineInfo } from '../utils/metroNetworkQueries.ts'
import { MetroLinePill } from './MetroLinePill.tsx'
import './Metro.css'

interface MetroStationDetailProps {
  station: MapStation
  /** Where the station sits on each line; empty when the network data is not loaded. */
  sequence: readonly StationLineInfo[]
  onClose: () => void
}

const ROLE_TEXT: Partial<Record<MapStation['role'], string>> = {
  boarding: 'Boarding station of your journey',
  exit: 'Exit station of your journey',
  interchange: 'Interchange on your journey',
  journey: 'On your journey',
}

/**
 * What the imported dataset says about a station: its name, its lines, whether it is an interchange and its
 * place in each line's sequence. Nothing else (platforms, gates, facilities, live status) is shown, because
 * none of it is in the data.
 */
export function MetroStationDetail({ station, sequence, onClose }: MetroStationDetailProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
  }, [station.key])
  return (
    <section
      className="metro-detail"
      aria-label={`Station details: ${station.name}`}
      data-metro-detail
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="metro-detail__header">
        <h3 className="metro-detail__name">{station.name}</h3>
        <button ref={closeRef} type="button" className="metro-detail__close" aria-label="Close station details" onClick={onClose}>
          <CloseIcon width={16} height={16} />
        </button>
      </header>
      {ROLE_TEXT[station.role] !== undefined && <p className="metro-detail__role">{ROLE_TEXT[station.role]}</p>}
      {station.interchange && <p className="metro-detail__role">Interchange station</p>}
      {station.lines.length > 0 && (
        <ul className="metro-detail__lines" aria-label="Lines">
          {station.lines.map((line) => (
            <li key={line.label}>
              <MetroLinePill name={line.label} color={line.color} />
            </li>
          ))}
        </ul>
      )}
      {sequence.length > 0 && (
        <ul className="metro-detail__sequence" aria-label="Position on each line">
          {sequence.map((info) => (
            <li key={info.line.id}>
              <strong>{info.line.name}</strong>: station {info.position} of {info.total}
              {info.toward !== null && info.toward !== '' && ` (towards ${info.toward})`}
              {(info.previous !== null || info.next !== null) && (
                <span className="metro-detail__neighbours">
                  {info.previous !== null && `Previous: ${info.previous}`}
                  {info.previous !== null && info.next !== null && ' · '}
                  {info.next !== null && `Next: ${info.next}`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
