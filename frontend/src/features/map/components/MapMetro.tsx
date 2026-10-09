import { AdvancedMarker, Polyline, useMap } from '@vis.gl/react-google-maps'
import { memo, useEffect, useMemo, useState } from 'react'
import { MetroStationDetail } from '../../metro/components/MetroStationDetail.tsx'
import { MetroStationMarker } from '../../metro/components/MetroStationMarker.tsx'
import type { MetroNetwork } from '../../metro/types/metro.ts'
import {
  LABEL_MIN_ZOOM,
  isJourneyLine,
  networkLines,
  networkStations,
  visibleNetworkStation,
  type MapStation,
} from '../../metro/utils/mapMetro.ts'
import { indexNetwork, stationSequence } from '../../metro/utils/metroNetworkQueries.ts'
import { mapConfig } from '../config/mapConfig.ts'
import { readMapInsets } from '../utils/mapOverlays.ts'
import { centerForVisiblePoint, clampInsets } from '../utils/viewportMath.ts'

interface MapMetroProps {
  /** The Metro layer: null when switched off or not loaded. */
  network: MetroNetwork | null
  /** Stations of the selected journey: drawn whether or not the layer is on. */
  journeyStations: readonly MapStation[]
  /** Dataset line ids the selected journey rides; other lines are de-emphasised while a journey is selected. */
  journeyLineIds: ReadonlySet<string>
  selectedStationKey: string | null
  onSelectStation: (key: string | null) => void
}

const NO_STATIONS: readonly MapStation[] = []

/**
 * The metro layer and the selected journey's stations. Lines are drawn as ordered station-to-station
 * connections (not the rail alignment); the calculated journey itself is the routing provider's polyline,
 * drawn by the route layer. Stations appear by zoom: interchanges first, then every station, then names.
 * Must be a child of `<Map>`.
 */
export const MapMetro = memo(function MapMetro({ network, journeyStations, journeyLineIds, selectedStationKey, onSelectStation }: MapMetroProps) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map?.getZoom() ?? 0)

  useEffect(() => {
    if (!map) return
    // Reading the camera on mount and on every zoom change is syncing with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(map.getZoom() ?? 0)
    const listener = map.addListener('zoom_changed', () => setZoom(map.getZoom() ?? 0))
    return () => listener.remove()
  }, [map])

  const lines = useMemo(() => (network ? networkLines(network) : []), [network])
  const stations = useMemo(() => (network ? networkStations(network) : NO_STATIONS), [network])
  const index = useMemo(() => (network ? indexNetwork(network) : null), [network])
  const journeyKeys = useMemo(() => new Set(journeyStations.map((station) => station.key)), [journeyStations])
  const journeyActive = journeyStations.length > 0

  const selected = useMemo(
    () => journeyStations.find((s) => s.key === selectedStationKey) ?? stations.find((s) => s.key === selectedStationKey) ?? null,
    [journeyStations, stations, selectedStationKey],
  )
  const selectedLat = selected?.position.lat
  const selectedLng = selected?.position.lng
  const selectedKey = selected?.key

  // Bring a selected station to the middle of the part of the map that no panel covers.
  useEffect(() => {
    if (!map || selectedLat === undefined || selectedLng === undefined) return
    const zoomTarget = Math.max(map.getZoom() ?? 0, mapConfig.areaHighlightMinZoom + 2)
    const element = map.getDiv()
    const insets = clampInsets({ width: element.clientWidth, height: element.clientHeight }, readMapInsets(element))
    map.panTo(centerForVisiblePoint({ lat: selectedLat, lng: selectedLng }, zoomTarget, insets))
    if ((map.getZoom() ?? 0) < zoomTarget) map.setZoom(zoomTarget)
  }, [map, selectedKey, selectedLat, selectedLng])

  const sequence = selected && network && index ? stationSequence(network, index, selected.key) : []

  return (
    <>
      {lines.map((line) => {
        const used = !journeyActive || journeyLineIds.size === 0 || isJourneyLine(line, journeyLineIds)
        return line.paths.map((path, i) => (
          <Polyline
            key={`${line.id}:${i}`}
            path={path as google.maps.LatLngLiteral[]}
            strokeColor={line.color}
            strokeWeight={used ? 4 : 2}
            strokeOpacity={used ? 0.85 : 0.25}
            zIndex={0}
            clickable={false}
          />
        ))
      })}
      {stations
        .filter((station) => !journeyKeys.has(station.key) && visibleNetworkStation(station, zoom))
        .map((station) => (
          <AdvancedMarker key={`n:${station.key}`} position={station.position} zIndex={station.interchange ? 4 : 3}>
            <MetroStationMarker
              station={station}
              selected={station.key === selectedStationKey}
              labelled={zoom >= LABEL_MIN_ZOOM || station.key === selectedStationKey}
              muted={journeyActive}
              onSelect={onSelectStation}
            />
          </AdvancedMarker>
        ))}
      {journeyStations.map((station) => (
        <AdvancedMarker key={`j:${station.key}`} position={station.position} zIndex={station.role === 'journey' ? 6 : 8}>
          <MetroStationMarker
            station={station}
            selected={station.key === selectedStationKey}
            labelled={station.role !== 'journey' || station.key === selectedStationKey}
            onSelect={onSelectStation}
          />
        </AdvancedMarker>
      ))}
      {selected && <MapMetroDetail station={selected} sequence={sequence} onClose={() => onSelectStation(null)} />}
    </>
  )
})

/** The detail card is a plain overlay in the map's corner (outside the canvas), not a map marker. */
function MapMetroDetail({ station, sequence, onClose }: { station: MapStation; sequence: ReturnType<typeof stationSequence>; onClose: () => void }) {
  return (
    <div className="map-metro-detail">
      <MetroStationDetail station={station} sequence={sequence} onClose={onClose} />
    </div>
  )
}
