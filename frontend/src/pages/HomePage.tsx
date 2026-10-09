import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DestinationSearchBar } from '../features/location/components/DestinationSearchBar.tsx'
import { DirectionsPanel } from '../features/location/components/DirectionsPanel.tsx'
import { LocationPanel } from '../features/location/components/LocationPanel.tsx'
import { useCurrentLocation } from '../features/location/hooks/useCurrentLocation.ts'
import type { LocationSelection } from '../features/location/types/location.ts'
import { useMetroNetwork } from '../features/metro/hooks/useMetroNetwork.ts'
import { journeyLineIds, journeyStations } from '../features/metro/utils/mapMetro.ts'
import { journeyBusParts, journeyBusStops } from '../features/bus/utils/mapBus.ts'
import { routeColor } from '../features/route/utils/routeColors.ts'
import { MapView, type BusMapProps, type MetroMapProps } from '../features/map/components/MapView.tsx'
import type { MapHighlight, MapMarker, MapRoute } from '../features/map/types/map.ts'
import { useAreaSearch } from '../features/search/hooks/useAreaSearch.ts'
import { PassingAreaDisclosure } from '../features/search/components/PassingAreaDisclosure.tsx'
import { PassingAreaSearch } from '../features/search/components/PassingAreaSearch.tsx'
import { JourneyView } from '../features/journey/components/JourneyView.tsx'
import { SharedLinkNotice } from '../features/share/components/SharedLinkNotice.tsx'
import { useSharedLink } from '../features/share/hooks/useSharedLink.ts'
import { useLocationSearchService } from '../features/location/hooks/useLocationSearchService.ts'
import { env } from '../config/env.ts'
import { PlacesPanel, type RepeatRequest } from '../features/places/components/PlacesPanel.tsx'
import { usePlaces } from '../features/places/hooks/usePlaces.ts'
import { toJourneyRecord } from '../features/places/utils/journeyRecord.ts'
import { CURRENT_LOCATION } from '../features/places/types/places.ts'
import { validateLocationPair } from '../features/location/utils/locationValidation.ts'
import { setOfflineHint } from '../app/offlineHint.ts'
import { useOfflineJourneys } from '../features/offline/hooks/useOfflineJourneys.ts'
import { PreferencesPanel } from '../features/preferences/components/PreferencesPanel.tsx'
import { PreferencesSummary } from '../features/preferences/components/PreferencesSummary.tsx'
import { usePreferences } from '../features/preferences/hooks/usePreferences.ts'
import { usePreferredSession } from '../features/preferences/hooks/usePreferredSession.ts'
import { useOnlineStatus } from '../app/useOnlineStatus.ts'
import { useMediaQuery } from '../ui/useMediaQuery.ts'
import { BottomSheet, type SheetSnap } from '../ui/BottomSheet.tsx'
import { RouteList } from '../features/route/components/RouteList.tsx'
import { TravelModeSelector } from '../features/route/components/TravelModeSelector.tsx'
import { useRouteSession } from '../features/route/hooks/useRouteSession.ts'
import { locationKey } from '../features/route/state/routeSession.ts'
import { DEFAULT_TRAVEL_MODE, TRAVEL_MODE_INFO, describeNoRoute, type TravelMode } from '../features/route/types/travelMode.ts'
import { toMapRoutes } from '../features/route/utils/toMapRoutes.ts'
import './HomePage.css'

function toMarker(kind: MapMarker['kind'], location: LocationSelection | null): MapMarker[] {
  if (!location) {
    return []
  }
  return [
    {
      id: kind,
      kind,
      position: { lat: location.latitude, lng: location.longitude },
      label: location.name,
    },
  ]
}

const NO_MAP_ROUTES: readonly MapRoute[] = []
const NO_IDS: ReadonlySet<string> = new Set()
const NO_UNAVAILABLE: Readonly<Partial<Record<TravelMode, string>>> = {}

export function HomePage() {
  const [start, setStart] = useState<LocationSelection | null>(null)
  const [destination, setDestination] = useState<LocationSelection | null>(null)
  // The device position is requested only by an explicit press: on the map control, or "Use my current location".
  const { state: locationState, locate, dismissError } = useCurrentLocation()
  // The start field shows a start that was set from outside it (current location); the key remounts the field.
  const [startFieldKey, setStartFieldKey] = useState(0)
  const [locatingStart, setLocatingStart] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const pendingStart = useRef(false)
  const [destinationFocus, setDestinationFocus] = useState(0)
  // Saved places and recent journeys: kept in this browser only, opened from a button so the map screen stays clear.
  const places = usePlaces()
  // Journeys kept for offline use (Bus stop sequences, or places and mode only), explicitly saved and removable.
  const offline = useOfflineJourneys()
  const online = useOnlineStatus()
  const [placesOpen, setPlacesOpen] = useState(false)
  // A repeated journey is calculated once its places are in place (a current-location start waits for the fix).
  const [autoFind, setAutoFind] = useState(false)
  // Wide screens: once a destination is chosen the search bar becomes the docked directions panel (both fields).
  const desktop = useMediaQuery('(min-width: 768px)')
  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [destinationFieldKey, setDestinationFieldKey] = useState(0)
  // Choosing a mode only changes this state; the routes are requested by Find Routes (the mode is part of the request).
  const [travelMode, setTravelMode] = useState<TravelMode>(DEFAULT_TRAVEL_MODE)
  // Personal preferences order and filter the routes of the session (a view of it): changing them never recalculates.
  const preferences = usePreferences()
  const rawSession = useRouteSession(start, destination, travelMode)
  const { state, session, selectedArea, calculate, selectRoute, selectArea, selectRouteArea } = usePreferredSession(rawSession, start, destination, travelMode, preferences.preferences)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const search = useAreaSearch(session)
  const pairKey = locationKey(start, destination)
  // The journey for which routes were dropped because the mode changed (shown as "press Find Routes").
  const [staleFor, setStaleFor] = useState<string | null>(null)
  const stale = staleFor !== null && staleFor === pairKey && state.status === 'none'
  // Modes the provider reported as having no route for the current pair of places.
  const [unavailableFor, setUnavailableFor] = useState<{ pair: string; modes: Partial<Record<TravelMode, string>> } | null>(null)
  const unavailable = unavailableFor !== null && unavailableFor.pair === pairKey ? unavailableFor.modes : NO_UNAVAILABLE
  const stateStatus = state.status
  const unsupported = state.status === 'error' && state.unsupportedMode === true
  const emptyResult = session !== null && session.routes.length === 0 && session.preference?.noMatch !== true
  const sessionMode = session?.travelMode ?? null
  const noRouteReason = session?.noRouteReason
  useEffect(() => {
    if (pairKey === null || travelMode === DEFAULT_TRAVEL_MODE) {
      return
    }
    // A bus answer that is only "no service at this time" or "bus data unavailable" can change by itself: it does not lock the mode.
    const temporary = travelMode === 'BUS' && (noRouteReason === 'NO_SERVICE' || noRouteReason === 'NO_BUS_DATA')
    if (!temporary && (unsupported || (emptyResult && sessionMode === travelMode))) {
      const reason = TRAVEL_MODE_INFO[travelMode].transit ? describeNoRoute(travelMode, travelMode === 'BUS' ? (noRouteReason ?? null) : null) : 'Not available for this journey.'
      setUnavailableFor((current) => ({ pair: pairKey, modes: { ...(current?.pair === pairKey ? current.modes : {}), [travelMode]: reason } }))
    }
  }, [stateStatus, unsupported, emptyResult, sessionMode, travelMode, pairKey, noRouteReason])
  // Metro: the network layer is optional and loaded on first use; the station selection belongs to one set of routes.
  const [metroLayerOn, setMetroLayerOn] = useState(false)
  const metroNetwork = useMetroNetwork(metroLayerOn)
  const [pickedStation, setPickedStation] = useState<{ key: string; routes: unknown; routeId: string | null } | null>(null)
  const toggleMetroLayer = useCallback(() => setMetroLayerOn((on) => !on), [])
  // Which view of the same session is shown. The selected route itself always lives in the session.
  const [journeyRequested, setJourneyOpen] = useState(false)
  // The Journey View only exists for a session that has a selected route; otherwise the comparison view is shown.
  const journeyOpen = journeyRequested && session !== null && session.selectedRouteId !== null

  // Focus follows the view change: into the Journey View when it opens, back to its button when it closes.
  const journeyWasOpen = useRef(false)
  useEffect(() => {
    if (journeyOpen && !journeyWasOpen.current) {
      document.querySelector<HTMLElement>('.journey-view__back')?.focus()
    } else if (!journeyOpen && journeyWasOpen.current) {
      document.querySelector<HTMLElement>('[data-journey-open]')?.focus()
    }
    journeyWasOpen.current = journeyOpen
  }, [journeyOpen])

  const markers = useMemo(
    () => [...toMarker('start', start), ...toMarker('destination', destination)],
    [start, destination],
  )

  // Depends on the routes only: selecting another route must not redraw the lines or refit the map.
  const sessionRoutes = session?.routes
  const mapRoutes = useMemo<readonly MapRoute[]>(
    () => (sessionRoutes ? toMapRoutes(sessionRoutes) : NO_MAP_ROUTES),
    [sessionRoutes],
  )

  const selectedRoute = session?.routes.find((route) => route.id === session.selectedRouteId)
  const selectedMetro = selectedRoute?.metro
  const selectedBus = selectedRoute?.bus
  const selectedRouteIndex = selectedRoute?.index ?? 0
  const busParts = useMemo(() => journeyBusParts(selectedBus), [selectedBus])
  const busJourneyStops = useMemo(() => journeyBusStops(selectedBus), [selectedBus])
  const [busLayerOn, setBusLayerOn] = useState(false)
  const toggleBusLayer = useCallback(() => setBusLayerOn((on) => !on), [])
  const metroStations = useMemo(() => journeyStations(selectedMetro), [selectedMetro])
  const metroLineIds = useMemo(() => journeyLineIds(selectedMetro), [selectedMetro])
  const selectedRouteId = session?.selectedRouteId ?? null
  // A picked station only counts for the routes (and the selected route) it was picked on.
  const selectedStationKey = pickedStation !== null && pickedStation.routes === sessionRoutes && pickedStation.routeId === selectedRouteId ? pickedStation.key : null
  const selectStation = useCallback(
    (key: string | null) => setPickedStation(key === null ? null : { key, routes: sessionRoutes, routeId: selectedRouteId }),
    [sessionRoutes, selectedRouteId],
  )
  const metroMap = useMemo<MetroMapProps>(
    () => ({
      layerOn: metroLayerOn,
      network: metroNetwork,
      onToggleLayer: toggleMetroLayer,
      journeyStations: metroStations,
      journeyLineIds: metroLineIds,
      selectedStationKey,
      onSelectStation: selectStation,
    }),
    [metroLayerOn, metroNetwork, toggleMetroLayer, metroStations, metroLineIds, selectedStationKey, selectStation],
  )

  // The selected bus journey draws its own rides and walks; its route line is then not drawn twice. Other routes stay secondary lines.
  const busHidden = useMemo<ReadonlySet<string>>(
    () => (selectedBus !== undefined && busParts.length > 0 && selectedRoute !== undefined ? new Set([selectedRoute.id]) : NO_IDS),
    [selectedBus, busParts, selectedRoute],
  )
  const busMap = useMemo<BusMapProps>(
    () => ({
      layerOn: busLayerOn,
      onToggleLayer: toggleBusLayer,
      parts: busParts,
      journeyStops: busJourneyStops,
      color: routeColor(selectedRouteIndex),
      hiddenRouteIds: busHidden,
      selectedStopKey: selectedStationKey,
      onSelectStop: selectStation,
    }),
    [busLayerOn, toggleBusLayer, busParts, busJourneyStops, selectedRouteIndex, busHidden, selectedStationKey, selectStation],
  )

  // On a phone the results sheet opens to half height when there is something new to read.
  const [snap, setSnap] = useState<SheetSnap>('peek')

  // New start or destination = a different journey: the old search text and selected areas must not carry over.
  // Stable handlers: typing in the search or selecting a stop must not re-render the location panel or the map.
  const resetSearch = search.reset
  const changeStart = useCallback(
    (location: LocationSelection | null) => {
      setStart(location)
      setLocateError(null)
      resetSearch()
      setJourneyOpen(false)
    },
    [resetSearch],
  )
  const changeDestination = useCallback(
    (location: LocationSelection | null) => {
      setDestination(location)
      resetSearch()
      setJourneyOpen(false)
      setPlacesOpen(false)
      if (location !== null) {
        setDirectionsOpen(true)
        // The route configuration appears with the destination; on a phone its sheet opens to a readable height.
        setSnap('half')
      }
    },
    [resetSearch],
  )
  // Swapping exchanges the two places; it is a different journey, exactly like choosing new places.
  const swapLocations = useCallback(() => {
    setStart(destination)
    setDestination(start)
    setStartFieldKey((key) => key + 1)
    setDestinationFieldKey((key) => key + 1)
    setLocateError(null)
    resetSearch()
    setJourneyOpen(false)
  }, [start, destination, resetSearch])
  // Never calls the routing API. The old routes belong to another mode, so they are dropped (the session key
  // contains the mode) together with everything found in them; Find Routes calculates the new ones.
  const stateStatusRef = useRef(state.status)
  useEffect(() => {
    stateStatusRef.current = state.status
  })
  const pairKeyRef = useRef(pairKey)
  useEffect(() => {
    pairKeyRef.current = pairKey
  })
  const changeTravelMode = useCallback(
    (mode: TravelMode) => {
      if (stateStatusRef.current !== 'none') {
        setStaleFor(pairKeyRef.current)
      }
      setTravelMode(mode)
      resetSearch()
      setJourneyOpen(false)
    },
    [resetSearch],
  )
  const closeDirections = useCallback(() => {
    setDestination(null)
    setDirectionsOpen(false)
    setDestinationFieldKey((key) => key + 1)
    resetSearch()
    setJourneyOpen(false)
  }, [resetSearch])
  const startFromCurrentLocation = useCallback(() => {
    pendingStart.current = true
    setLocatingStart(true)
    setLocateError(null)
    locate()
  }, [locate])
  // Only a press on "Use my current location" turns a fix into the start; the map's locate button never does.
  const fixId = locationState.position?.fixId
  useEffect(() => {
    if (!pendingStart.current || locationState.status === 'locating') {
      return
    }
    pendingStart.current = false
    setLocatingStart(false)
    if (locationState.status === 'error') {
      setLocateError(locationState.message)
    } else if (locationState.position) {
      const { latitude, longitude } = locationState.position
      setStart({ name: 'Current location', latitude, longitude, origin: 'CURRENT_LOCATION' })
      setStartFieldKey((key) => key + 1)
      resetSearch()
      setJourneyOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixId, locationState.status])
  const chooseDestination = useCallback(() => {
    setDestinationFocus((n) => n + 1)
    // Wide screens: the directions panel opens at once, with the destination field focused.
    if (desktop) {
      setDirectionsOpen(true)
    }
    setSnap((current) => (current === 'full' ? 'half' : current))
  }, [desktop])

  const closeJourney = useCallback(() => {
    setJourneyOpen(false)
    setSnap('half')
  }, [])
  const openJourney = useCallback(() => {
    setJourneyOpen(true)
    setSnap('half')
  }, [])
  const recordJourney = places.recordJourney
  const findRoutes = useCallback(() => {
    setSnap('half')
    const requested = calculate()
    if (requested && start !== null && destination !== null) {
      const record = toJourneyRecord(start, destination, travelMode)
      if (record !== null) recordJourney(record)
    }
  }, [calculate, start, destination, travelMode, recordJourney])

  const growSheet = useCallback(() => setSnap('full'), [])
  const openPlaces = useCallback(() => {
    setPreferencesOpen(false)
    setPlacesOpen(true)
    setSnap('half')
  }, [])
  const closePlaces = useCallback(() => setPlacesOpen(false), [])
  // Offline, the notice points to the saved journeys (shown only while something is saved and the panel is not already open).
  const savedOfflineCount = offline.data.journeys.length
  useEffect(() => {
    setOfflineHint(savedOfflineCount > 0 && !placesOpen ? { count: savedOfflineCount, open: openPlaces } : null)
    return () => setOfflineHint(null)
  }, [savedOfflineCount, placesOpen, openPlaces])
  const openPreferences = useCallback(() => {
    setPlacesOpen(false)
    setPreferencesOpen(true)
    setSnap('half')
  }, [])
  const closePreferences = useCallback(() => setPreferencesOpen(false), [])
  const prefsWasOpen = useRef(false)
  useEffect(() => {
    if (!preferencesOpen && prefsWasOpen.current) {
      document.querySelector<HTMLElement>('[data-preferences-open]')?.focus()
    }
    prefsWasOpen.current = preferencesOpen
  }, [preferencesOpen])
  // Focus returns to the button that opened the panel once the screen it belongs to is back.
  const placesWasOpen = useRef(false)
  useEffect(() => {
    if (!placesOpen && placesWasOpen.current) {
      document.querySelector<HTMLElement>('[data-places-open]')?.focus()
    }
    placesWasOpen.current = placesOpen
  }, [placesOpen])
  // A saved place becomes the destination, exactly as if it had been chosen from the suggestions.
  const useSavedAsDestination = useCallback(
    (location: LocationSelection) => {
      changeDestination(location)
      setDestinationFieldKey((key) => key + 1)
    },
    [changeDestination],
  )
  // Repeating restores the inputs and the mode, then calculates afresh (never the old Google result).
  const repeatJourney = useCallback(
    ({ start: from, destination: to, travelMode: mode }: Omit<RepeatRequest, 'start'> & { start: RepeatRequest['start'] | null }) => {
      setPlacesOpen(false)
      setTravelMode(mode)
      setDestination(to)
      setDestinationFieldKey((key) => key + 1)
      setDirectionsOpen(true)
      setLocateError(null)
      resetSearch()
      setJourneyOpen(false)
      setSnap('half')
      if (from === CURRENT_LOCATION) {
        setStart(null)
        setStartFieldKey((key) => key + 1)
        startFromCurrentLocation()
      } else {
        // A shared journey without a start waits for the person to choose one (nothing is calculated).
        setStart(from)
        setStartFieldKey((key) => key + 1)
      }
      setAutoFind(from !== null)
    },
    [resetSearch, startFromCurrentLocation],
  )
  useEffect(() => {
    if (!autoFind) return
    if (locateError !== null) {
      setAutoFind(false)
      return
    }
    if (start === null || destination === null || locatingStart) return
    setAutoFind(false)
    // The panels show the reason when the pair is not valid (for example the same place twice).
    if (validateLocationPair(start, destination) === null) findRoutes()
  }, [autoFind, start, destination, locatingStart, locateError, findRoutes])

  // A journey opened from a share link: the places are looked up again from their Place IDs and the routes calculated afresh.
  const placeLookup = useLocationSearchService()
  const sharedLink = useSharedLink({
    online,
    service: placeLookup.service,
    serviceUnavailable: !env.isGoogleMapsConfigured || placeLookup.availability === 'unavailable',
    onOpen: repeatJourney,
  })

  // While areas are selected, routes that do not pass through all of them are drawn as secondary.
  // Keyed by the ids themselves: typing more letters that dim the same routes keeps the same Set, so the map is untouched.
  const searchView = search.view
  const dimmedKey = useMemo<string | null>(() => {
    if (searchView === null) {
      return null
    }
    const { matches } = searchView
    return (sessionRoutes ?? [])
      .filter((route) => matches.get(route.id)?.complete !== true)
      .map((route) => route.id)
      .join('\n')
  }, [searchView, sessionRoutes])
  const dimmedRouteIds = useMemo<ReadonlySet<string> | undefined>(
    () => (dimmedKey === null ? undefined : new Set(dimmedKey.split('\n').filter((id) => id !== ''))),
    [dimmedKey],
  )

  const highlight = useMemo<MapHighlight | null>(
    () => (selectedArea ? { position: selectedArea.location, label: selectedArea.name } : null),
    [selectedArea],
  )

  const hasSheet = placesOpen || preferencesOpen || (desktop ? directionsOpen : destination !== null)
  const dock = desktop && (directionsOpen || placesOpen || preferencesOpen)
  const withPreferences = () => (
    <>
      {selector('inline')}
      <PreferencesSummary preferences={preferences.preferences} onOpen={openPreferences} />
    </>
  )
  const selector = (variant: 'floating' | 'inline') => (
    <TravelModeSelector value={travelMode} onChange={changeTravelMode} variant={variant} unavailable={unavailable} stale={stale} />
  )

  // On a phone the route configuration sits above the results in the same sheet: bring the results into view
  // when a calculation starts, so the person sees the loading state and then the routes.
  const calculating = state.status === 'loading'
  useEffect(() => {
    if (calculating && window.matchMedia('(max-width: 767.98px)').matches) {
      document.querySelector('.route-list')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [calculating])
  const passingSearch = (compact: boolean) => (
    <PassingAreaSearch
      compact={compact}
      session={session}
      query={search.query}
      outcome={search.suggestions}
      selected={search.selected}
      multi={search.multi}
      onQueryChange={search.setQuery}
      onAdd={search.add}
      onRemove={search.remove}
      onClear={search.clearAreas}
      onChoose={selectRouteArea}
    />
  )

  return (
    <div
      className="home-page"
      data-view={journeyOpen ? 'journey' : 'compare'}
      data-snap={snap}
      data-sheet={hasSheet ? 'on' : 'off'}
      data-dock={dock ? 'on' : 'off'}
    >
      {sharedLink.notice !== null && <SharedLinkNotice notice={sharedLink.notice} onRetry={sharedLink.retry} onDismiss={sharedLink.dismiss} />}
      <div className="home-page__sidebar" data-map-overlay={dock ? '' : undefined}>
        {(desktop ? !directionsOpen : !journeyOpen) && <DestinationSearchBar key={destinationFieldKey} destination={destination} onChange={changeDestination} focusSignal={destinationFocus} onOpenPlaces={openPlaces} />}
        {!hasSheet && selector('floating')}
        {hasSheet && (
          <BottomSheet snap={snap} onSnapChange={setSnap} label={preferencesOpen ? 'Travel preferences' : placesOpen ? 'Saved places and recent journeys' : journeyOpen ? 'Journey details' : 'Route options'}>
            {preferencesOpen ? (
              <PreferencesPanel api={preferences} outcome={session?.preference ?? null} onClose={closePreferences} />
            ) : placesOpen ? (
              <PlacesPanel places={places} offline={offline} online={online} onClose={closePlaces} onUseAsDestination={useSavedAsDestination} onRepeat={repeatJourney} onNeedRoom={growSheet} />
            ) : journeyOpen ? (
              <>
                <JourneyView
                  state={state}
                  search={search.view}
                  onSelectRoute={selectRoute}
                  onSelectArea={selectArea}
                  onBack={closeJourney}
                  selectedStationKey={selectedStationKey}
                  onSelectStation={selectStation}
                  offline={offline}
                  preferences={preferences.preferences}
                />
                {passingSearch(false)}
              </>
            ) : (
              <>
                {desktop ? (
                <DirectionsPanel
                  start={start}
                  destination={destination}
                  onStartChange={changeStart}
                  onDestinationChange={changeDestination}
                  onSwap={swapLocations}
                  onClose={closeDirections}
                  onUseCurrentLocation={startFromCurrentLocation}
                  onOpenPlaces={openPlaces}
                  locatingStart={locatingStart}
                  locateError={locateError}
                  startFieldKey={startFieldKey}
                  destinationFieldKey={destinationFieldKey}
                  focusSignal={destinationFocus}
                  onFindRoutes={findRoutes}
                  isFindingRoutes={state.status === 'loading'}
                  modeSelector={withPreferences()}
                >
                  <PassingAreaDisclosure selected={search.selected} onRemove={search.remove}>
                    {passingSearch(true)}
                  </PassingAreaDisclosure>
                </DirectionsPanel>
                ) : (
                <LocationPanel
                  start={start}
                  destination={destination}
                  onStartChange={changeStart}
                  onUseCurrentLocation={startFromCurrentLocation}
                  onOpenPlaces={openPlaces}
                  locatingStart={locatingStart}
                  locateError={locateError}
                  startFieldKey={startFieldKey}
                  onFindRoutes={findRoutes}
                  isFindingRoutes={state.status === 'loading'}
                  modeSelector={withPreferences()}
                >
                  <PassingAreaDisclosure selected={search.selected} onRemove={search.remove}>
                    {passingSearch(true)}
                  </PassingAreaDisclosure>
                </LocationPanel>
                )}
                {state.status !== 'none' && (
                  <RouteList
                    state={state}
                    hasLocations={start !== null && destination !== null}
                    onSelect={selectRoute}
                    onAreaSelect={selectArea}
                    onRetry={findRoutes}
                    onOpenJourney={openJourney}
                    search={search.view}
                    selectedStationKey={selectedStationKey}
                    onSelectStation={selectStation}
                    destinationName={destination?.name}
                    onOpenPreferences={openPreferences}
                  />
                )}
              </>
            )}
          </BottomSheet>
        )}
      </div>
      <MapView
        markers={markers}
        routes={mapRoutes}
        selectedRouteId={session?.selectedRouteId ?? null}
        onRouteSelect={selectRoute}
        dimmedRouteIds={dimmedRouteIds}
        highlight={highlight}
        layoutKey={`${journeyOpen ? 'journey' : 'compare'}:${hasSheet ? snap : 'none'}`}
        locationState={locationState}
        onLocate={locate}
        onDismissLocationError={dismissError}
        onChooseDestination={chooseDestination}
        destinationChosen={destination !== null}
        metro={metroMap}
        bus={busMap}
      />
    </div>
  )
}
