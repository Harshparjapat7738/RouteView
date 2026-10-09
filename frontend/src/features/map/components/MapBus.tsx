import { AdvancedMarker, Polyline, useMap } from '@vis.gl/react-google-maps'
import { memo, useEffect, useMemo, useState } from 'react'
import { BusStopMarker } from '../../bus/components/BusStopMarker.tsx'
import { useBusStops } from '../../bus/hooks/useBusStops.ts'
import {
  NETWORK_STOP_MIN_ZOOM,
  STOP_LABEL_MIN_ZOOM,
  networkOnly,
  visibleJourneyStop,
  type MapBusPart,
  type MapBusStop,
} from '../../bus/utils/mapBus.ts'
import { mapConfig } from '../config/mapConfig.ts'
import { readMapInsets } from '../utils/mapOverlays.ts'
import { centerForVisiblePoint, clampInsets } from '../utils/viewportMath.ts'
import '../../bus/components/Bus.css'

interface MapBusProps {
  /** The Bus layer: bus stops of the part of the map in view, only when zoomed in. */
  layerOn: boolean
  /** The parts (rides and walks) of the selected bus journey, drawn on top of everything. */
  parts: readonly MapBusPart[]
  /** The stops of the selected bus journey: drawn whether or not the layer is on. */
  journeyStops: readonly MapBusStop[]
  /** The selected route's colour: the bus rides use it. */
  color: string
  selectedStopKey: string | null
  onSelectStop: (key: string | null) => void
}

interface View {
  zoom: number
  window: { south: number; west: number; north: number; east: number } | null
}

/** The most the backend answers for (degrees); the requested window is centred and never larger. */
const MAX_SPAN = 0.036
const WALK_DASH = [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '12px' }]

/**
 * The selected bus journey and the optional bus-stop layer. The journey is the dominant thing: a white casing and a thick
 * line per bus ride, a dashed line per walk, and its boarding / transfer / exit stops (always shown) and the stops in between
 * (shown from a closer zoom). Other bus stops appear only while the layer is on and the map is close. Must be a child of `<Map>`.
 */
export const MapBus = memo(function MapBus({ layerOn, parts, journeyStops, color, selectedStopKey, onSelectStop }: MapBusProps) {
  const map = useMap()
  const [view, setView] = useState<View>({ zoom: 0, window: null })

  useEffect(() => {
    if (!map) return
    const read = () => {
      const bounds = map.getBounds()
      const zoom = map.getZoom() ?? 0
      if (!bounds || typeof bounds.getNorthEast !== 'function' || typeof bounds.getSouthWest !== 'function') {
        setView({ zoom, window: null })
        return
      }
      const ne = bounds.getNorthEast()
      const sw = bounds.getSouthWest()
      const centerLat = (ne.lat() + sw.lat()) / 2
      const centerLng = (ne.lng() + sw.lng()) / 2
      const halfLat = Math.min((ne.lat() - sw.lat()) / 2, MAX_SPAN / 2)
      const halfLng = Math.min((ne.lng() - sw.lng()) / 2, MAX_SPAN / 2)
      setView({ zoom, window: { south: centerLat - halfLat, west: centerLng - halfLng, north: centerLat + halfLat, east: centerLng + halfLng } })
    }
    // Reading the camera on mount and when it settles is syncing with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    read()
    const idle = map.addListener('idle', read)
    return () => idle.remove()
  }, [map])

  const zoomedIn = view.zoom >= NETWORK_STOP_MIN_ZOOM
  const stopsState = useBusStops(layerOn, zoomedIn, view.window)
  const journeyKeys = useMemo(() => new Set(journeyStops.map((stop) => stop.key)), [journeyStops])
  const journeyActive = journeyStops.length > 0
  const loaded = stopsState.status === 'ready' ? stopsState.data : stopsState.status === 'loading' || stopsState.status === 'error' ? stopsState.previous : null
  const networkStops = useMemo(() => (loaded ? networkOnly(loaded.stops, journeyKeys) : []), [loaded, journeyKeys])

  const selected = useMemo(
    () => journeyStops.find((stop) => stop.key === selectedStopKey) ?? networkStops.find((stop) => stop.key === selectedStopKey) ?? null,
    [journeyStops, networkStops, selectedStopKey],
  )
  const selectedLat = selected?.position.lat
  const selectedLng = selected?.position.lng
  const selectedKey = selected?.key

  // Bring a selected stop to the middle of the part of the map that no panel covers.
  useEffect(() => {
    if (!map || selectedLat === undefined || selectedLng === undefined) return
    const zoomTarget = Math.max(map.getZoom() ?? 0, mapConfig.areaHighlightMinZoom + 2)
    const element = map.getDiv()
    const insets = clampInsets({ width: element.clientWidth, height: element.clientHeight }, readMapInsets(element))
    map.panTo(centerForVisiblePoint({ lat: selectedLat, lng: selectedLng }, zoomTarget, insets))
    if ((map.getZoom() ?? 0) < zoomTarget) map.setZoom(zoomTarget)
  }, [map, selectedKey, selectedLat, selectedLng])

  return (
    <>
      {parts.map((part) =>
        part.kind === 'bus' ? (
          <BusRidePolyline key={part.key} path={part.path} color={color} />
        ) : (
          <Polyline
            key={part.key}
            path={part.path as google.maps.LatLngLiteral[]}
            strokeColor="#475569"
            strokeOpacity={0}
            icons={WALK_DASH}
            zIndex={4}
            clickable={false}
          />
        ),
      )}
      {networkStops.map((stop) => (
        <AdvancedMarker key={`n:${stop.key}`} position={stop.position} zIndex={3}>
          <BusStopMarker
            stop={stop}
            selected={stop.key === selectedStopKey}
            labelled={view.zoom >= STOP_LABEL_MIN_ZOOM + 1 || stop.key === selectedStopKey}
            muted={journeyActive}
            onSelect={onSelectStop}
          />
        </AdvancedMarker>
      ))}
      {journeyStops
        .filter((stop) => visibleJourneyStop(stop, view.zoom, stop.key === selectedStopKey))
        .map((stop) => (
          <AdvancedMarker key={`j:${stop.key}`} position={stop.position} zIndex={stop.role === 'journey' ? 6 : 8}>
            <BusStopMarker
              stop={stop}
              selected={stop.key === selectedStopKey}
              labelled={stop.role !== 'journey' || view.zoom >= STOP_LABEL_MIN_ZOOM || stop.key === selectedStopKey}
              onSelect={onSelectStop}
            />
          </AdvancedMarker>
        ))}
      {layerOn && <BusLayerStatus state={stopsState} truncated={loaded?.truncated === true} />}
    </>
  )
})

function BusRidePolyline({ path, color }: { path: MapBusPart['path']; color: string }) {
  return (
    <>
      <Polyline path={path as google.maps.LatLngLiteral[]} strokeColor="#ffffff" strokeOpacity={1} strokeWeight={11} zIndex={3} clickable={false} />
      <Polyline path={path as google.maps.LatLngLiteral[]} strokeColor={color} strokeOpacity={1} strokeWeight={7} zIndex={4} clickable={false} />
    </>
  )
}

function BusLayerStatus({ state, truncated }: { state: ReturnType<typeof useBusStops>; truncated: boolean }) {
  let text = ''
  if (state.status === 'zoom-in') text = 'Zoom in to see bus stops.'
  else if (state.status === 'loading') text = 'Loading bus stops...'
  else if (state.status === 'error') text = 'Bus stops could not be loaded here.'
  else if (state.status === 'ready' && state.data.stops.length === 0) text = 'No bus stops in this part of the map.'
  else if (truncated) text = 'Zoom in to see all bus stops.'
  if (text === '') return null
  return (
    <div className="map-bus-status" role="status" data-bus-layer-status={state.status}>
      {text}
    </div>
  )
}
