import { APILoadingStatus, Map, useApiLoadingStatus } from '@vis.gl/react-google-maps'
import { memo, useEffect, useMemo, useState } from 'react'
import { env } from '../../../config/env.ts'
import type { CurrentLocationState } from '../../location/hooks/useCurrentLocation.ts'
import { useMediaQuery } from '../../../ui/useMediaQuery.ts'
import { mapConfig } from '../config/mapConfig.ts'
import type { MapCurrentLocation, MapHighlight, MapMarker, MapRoute } from '../types/map.ts'
import { MapCurrentLocationMarker } from './MapCurrentLocationMarker.tsx'
import { MapDestinationControl } from './MapDestinationControl.tsx'
import { MapLocateControl } from './MapLocateControl.tsx'
import { MapAreaHighlight } from './MapAreaHighlight.tsx'
import { MapMarkers } from './MapMarkers.tsx'
import { MapMetro } from './MapMetro.tsx'
import { MapMetroControl } from './MapMetroControl.tsx'
import { MapBus } from './MapBus.tsx'
import { MapBusControl } from './MapBusControl.tsx'
import type { MapBusPart, MapBusStop } from '../../bus/utils/mapBus.ts'
import type { MetroNetworkState } from '../../metro/hooks/useMetroNetwork.ts'
import type { MapStation } from '../../metro/utils/mapMetro.ts'
import { MapRoutes } from './MapRoutes.tsx'
import { MapViewport } from './MapViewport.tsx'
import { MapStatusMessage } from './MapStatusMessage.tsx'
import './MapView.css'

interface MapViewProps {
  markers?: readonly MapMarker[]
  routes?: readonly MapRoute[]
  selectedRouteId?: string | null
  onRouteSelect?: (routeId: string) => void
  /** Routes to draw as secondary (for example routes that do not match a search). */
  dimmedRouteIds?: ReadonlySet<string>
  /** A point to emphasise, e.g. where the selected route reaches a chosen area. */
  highlight?: MapHighlight | null
  /** Changes when the layout around the map changes (Journey View, bottom-sheet height); the camera re-checks then. */
  layoutKey?: string
  /** The device position state; owned by the page so the start location can use it too. */
  locationState: CurrentLocationState
  onLocate: () => void
  onDismissLocationError: () => void
  /** Opens the destination search (the "Choose destination" map control). */
  onChooseDestination: () => void
  /** A destination is confirmed: the control shows its active state. */
  destinationChosen: boolean
  /** Metro layer: switched on, its network state, and the stations of the selected journey. */
  metro?: MetroMapProps
  /** Bus layer: switched on, and the selected bus journey (its rides, walks and stops). */
  bus?: BusMapProps
}

export interface BusMapProps {
  layerOn: boolean
  onToggleLayer: () => void
  parts: readonly MapBusPart[]
  journeyStops: readonly MapBusStop[]
  color: string
  /** Routes whose line the journey layer draws itself. */
  hiddenRouteIds: ReadonlySet<string>
  selectedStopKey: string | null
  onSelectStop: (key: string | null) => void
}

export interface MetroMapProps {
  layerOn: boolean
  network: MetroNetworkState
  onToggleLayer: () => void
  journeyStations: readonly MapStation[]
  journeyLineIds: ReadonlySet<string>
  selectedStationKey: string | null
  onSelectStation: (key: string | null) => void
}

interface MapCanvasProps extends Required<Pick<MapViewProps, 'markers' | 'routes' | 'selectedRouteId' | 'highlight' | 'layoutKey' | 'locationState' | 'onLocate' | 'onDismissLocationError' | 'onChooseDestination' | 'destinationChosen'>> {
  dimmedRouteIds?: ReadonlySet<string>
  onRouteSelect?: (routeId: string) => void
  metro?: MetroMapProps
  bus?: BusMapProps
}

/** After this long without the Maps script finishing, say so and offer a reload. */
const SLOW_LOAD_MS = 15_000

const NO_MARKERS: readonly MapMarker[] = []
const NO_ROUTES: readonly MapRoute[] = []

/**
 * Reusable map presentation. It fills its parent's remaining space and contains
 * no routing, area or business logic. Must render inside `GoogleMapsProvider`.
 */
export const MapView = memo(function MapView({
  markers = NO_MARKERS,
  routes = NO_ROUTES,
  selectedRouteId = null,
  onRouteSelect,
  dimmedRouteIds,
  highlight = null,
  layoutKey = '',
  locationState,
  onLocate,
  onDismissLocationError,
  onChooseDestination,
  destinationChosen,
  metro,
  bus,
}: MapViewProps) {
  return (
    <div className="map-view">
      {env.isGoogleMapsConfigured ? (
        <MapCanvas
          markers={markers}
          routes={routes}
          selectedRouteId={selectedRouteId}
          highlight={highlight}
          layoutKey={layoutKey}
          locationState={locationState}
          onLocate={onLocate}
          onDismissLocationError={onDismissLocationError}
          onChooseDestination={onChooseDestination}
          destinationChosen={destinationChosen}
          dimmedRouteIds={dimmedRouteIds}
          onRouteSelect={onRouteSelect}
          metro={metro}
          bus={bus}
        />
      ) : (
        <MapStatusMessage variant="error">Google Maps API key is not configured.</MapStatusMessage>
      )}
    </div>
  )
})

function MapCanvas({
  markers,
  routes,
  selectedRouteId,
  highlight,
  layoutKey,
  locationState,
  onLocate,
  onDismissLocationError,
  onChooseDestination,
  destinationChosen,
  dimmedRouteIds,
  onRouteSelect,
  metro,
  bus,
}: MapCanvasProps) {
  const status = useApiLoadingStatus()
  // Phones zoom by pinching; their bottom edge belongs to the results sheet.
  const showZoomControl = useMediaQuery('(min-width: 768px)')
  const [slow, setSlow] = useState(false)
  const loaded = status === APILoadingStatus.LOADED
  const position = locationState.position
  const currentLocation = useMemo<MapCurrentLocation | null>(
    () =>
      position
        ? { fixId: position.fixId, position: { lat: position.latitude, lng: position.longitude }, accuracyMeters: position.accuracyMeters }
        : null,
    [position],
  )

  useEffect(() => {
    if (loaded) {
      return
    }
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS)
    return () => window.clearTimeout(timer)
  }, [loaded])

  if (status === APILoadingStatus.FAILED) {
    return (
      <MapStatusMessage variant="error" action={{ label: 'Reload map', onClick: () => window.location.reload() }}>
        The map could not be loaded. Check your connection and try again.
      </MapStatusMessage>
    )
  }

  if (status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <MapStatusMessage variant="error">
        The map is currently unavailable. Please try again later.
      </MapStatusMessage>
    )
  }

  return (
    <>
      <Map
        className="map-view__canvas"
        mapId={mapConfig.mapId}
        defaultCenter={mapConfig.defaultCenter}
        defaultZoom={mapConfig.defaultZoom}
        {...mapConfig.options}
        zoomControl={showZoomControl}
      >
        <MapViewport markers={markers} routes={routes} selectedRouteId={selectedRouteId} layoutKey={layoutKey} />
        <MapRoutes routes={routes} selectedRouteId={selectedRouteId} dimmedRouteIds={dimmedRouteIds} onRouteSelect={onRouteSelect} hiddenRouteIds={bus?.hiddenRouteIds} />
        <MapMarkers markers={markers} />
        <MapAreaHighlight highlight={highlight} />
        {metro !== undefined && (
          <MapMetro
            network={metro.layerOn && metro.network.status === 'ready' ? metro.network.network : null}
            journeyStations={metro.journeyStations}
            journeyLineIds={metro.journeyLineIds}
            selectedStationKey={metro.selectedStationKey}
            onSelectStation={metro.onSelectStation}
          />
        )}
        {bus !== undefined && (
          <MapBus
            layerOn={bus.layerOn}
            parts={bus.parts}
            journeyStops={bus.journeyStops}
            color={bus.color}
            selectedStopKey={bus.selectedStopKey}
            onSelectStop={bus.onSelectStop}
          />
        )}
        <MapCurrentLocationMarker location={currentLocation} />
      </Map>
      {bus !== undefined && <MapBusControl on={bus.layerOn} enabled={loaded} onToggle={bus.onToggleLayer} />}
      {metro !== undefined && <MapMetroControl on={metro.layerOn} state={metro.network} enabled={loaded} onToggle={metro.onToggleLayer} />}
      <MapDestinationControl active={destinationChosen} enabled={loaded} onChoose={onChooseDestination} />
      <MapLocateControl state={locationState} enabled={loaded} onLocate={onLocate} onDismissError={onDismissLocationError} />
      {!loaded && (
        <MapStatusMessage
          variant="loading"
          action={slow ? { label: 'Reload map', onClick: () => window.location.reload() } : undefined}
        >
          {slow ? 'The map is taking longer than expected to load.' : 'Loading map...'}
        </MapStatusMessage>
      )}
    </>
  )
}
