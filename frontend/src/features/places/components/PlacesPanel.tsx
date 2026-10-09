import { useEffect, useRef, useState } from 'react'
import { CloseIcon, EditIcon, HomeIcon, PlusIcon, RepeatIcon, StarIcon, TrashIcon, WorkIcon } from '../../../ui/Icons.tsx'
import { FloatingPanel } from '../../../ui/FloatingPanel.tsx'
import { toGoogleApiError } from '../../../services/google/googleFailure.ts'
import { runWithPolicy } from '../../../services/google/requestPolicy.ts'
import { useLocationSearchService } from '../../location/hooks/useLocationSearchService.ts'
import type { LocationSelection } from '../../location/types/location.ts'
import { TRAVEL_MODE_ICONS } from '../../route/components/travelModeIcons.ts'
import { TRAVEL_MODE_INFO, type TravelMode } from '../../route/types/travelMode.ts'
import type { PlacesApi } from '../hooks/usePlaces.ts'
import { CURRENT_LOCATION, type RecentJourney, type SavedPlace, type SavedPlaceKind } from '../types/places.ts'
import { MAX_SAVED_PLACES, RECENT_TTL_MS } from '../utils/placesData.ts'
import { describeRecent, formatSearchTime, originLabel } from '../utils/recentFormat.ts'
import { PlaceEditor } from './PlaceEditor.tsx'
import { OfflineJourneyDetails } from '../../offline/components/OfflineJourneyDetails.tsx'
import { SAVED_PLACE_FALLBACK } from '../../offline/utils/endpointLabel.ts'
import { OfflineJourneysSection } from '../../offline/components/OfflineJourneysSection.tsx'
import type { OfflineJourneysApi } from '../../offline/hooks/useOfflineJourneys.ts'
import { CURRENT_LOCATION_ORIGIN, type OfflineJourney } from '../../offline/types/offline.ts'
import './Places.css'

export interface RepeatRequest {
  start: LocationSelection | typeof CURRENT_LOCATION
  destination: LocationSelection
  travelMode: TravelMode
}

interface PlacesPanelProps {
  places: PlacesApi
  /** Journeys kept for offline use; without it the panel has no offline section. */
  offline?: OfflineJourneysApi
  online: boolean
  onClose: () => void
  /** A saved place was chosen: it becomes the destination (resolved to a location first). */
  onUseAsDestination: (location: LocationSelection) => void
  /** A recent journey was chosen: restore its places and mode; the parent recalculates. */
  onRepeat: (request: RepeatRequest) => void
  /** The panel needs room (a form with suggestions opened): a phone's sheet grows. */
  onNeedRoom?: () => void
}

type Editor = { type: 'add'; kind: SavedPlaceKind } | { type: 'rename' | 'place'; id: string }

const LOOKUP_TIMEOUT_MS = 8_000
const OFFLINE_MESSAGE = "You're offline. Reconnect to use saved places and repeat journeys."
const DAY_MS = 24 * 60 * 60 * 1000

function kindIcon(kind: SavedPlaceKind) {
  return kind === 'HOME' ? <HomeIcon width={20} height={20} /> : kind === 'WORK' ? <WorkIcon width={20} height={20} /> : <StarIcon width={20} height={20} />
}

/**
 * Saved places (Home, Work, custom) and recent journeys in one compact panel. Stored data is only Place IDs and
 * labels: choosing an item looks the place up again, so nothing stale is reused and no route is replayed.
 */
export function PlacesPanel({ places, offline, online, onClose, onUseAsDestination, onRepeat, onNeedRoom }: PlacesPanelProps) {
  const { service } = useLocationSearchService()
  const { data } = places
  const [editor, setEditor] = useState<Editor | null>(null)
  const [managing, setManaging] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [openOfflineId, setOpenOfflineId] = useState<string | null>(null)
  // Times are relative to when the panel opened; it is a short-lived view.
  const [now] = useState(() => Date.now())
  const headingRef = useRef<HTMLHeadingElement>(null)
  const latest = useRef(0)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  const editing = editor !== null
  useEffect(() => {
    if (editing) onNeedRoom?.()
  }, [editing, onNeedRoom])

  const home = data.saved.find((place) => place.kind === 'HOME')
  const work = data.saved.find((place) => place.kind === 'WORK')
  const custom = data.saved.filter((place) => place.kind === 'CUSTOM')

  async function lookUp(placeId: string, fallbackName: string): Promise<LocationSelection> {
    if (!service) throw new Error('Location search is not ready')
    const found = await runWithPolicy(() => service.resolve(placeId), {
      operation: 'placeDetails',
      timeoutMs: LOOKUP_TIMEOUT_MS,
      maxRetries: 1,
      retryDelayMs: 500,
    })
    return { ...found, name: found.name || fallbackName }
  }

  async function guarded(id: string, task: () => Promise<void>) {
    if (!online) {
      setMessage(OFFLINE_MESSAGE)
      return
    }
    const action = ++latest.current
    setBusy(id)
    setMessage(null)
    try {
      await task()
    } catch (error) {
      if (action === latest.current) {
        setMessage(
          service
            ? `${toGoogleApiError(error, 'placeDetails').message} If this place keeps failing, edit or remove it.`
            : 'Location search is not ready yet. Please try again in a moment.',
        )
      }
    } finally {
      if (action === latest.current) setBusy(null)
    }
  }

  function chooseSaved(place: SavedPlace) {
    void guarded(place.id, async () => {
      const found = await lookUp(place.placeId, place.label)
      // The person's own name for it is what the destination field shows.
      onUseAsDestination({ ...found, name: place.label })
    })
  }

  function repeat(journey: RecentJourney) {
    void guarded(journey.id, async () => {
      const [start, destination] = await Promise.all([
        journey.origin === CURRENT_LOCATION ? Promise.resolve<typeof CURRENT_LOCATION>(CURRENT_LOCATION) : lookUp(journey.origin.placeId, journey.origin.label),
        lookUp(journey.destination.placeId, journey.destination.label),
      ])
      onRepeat({ start, destination, travelMode: journey.travelMode })
    })
  }

  /** Refreshing a saved journey calculates it again online from its Place IDs, exactly like repeating a recent one. */
  function refreshOffline(journey: OfflineJourney) {
    void guarded(journey.id, async () => {
      const [start, destination] = await Promise.all([
        journey.origin === CURRENT_LOCATION_ORIGIN ? Promise.resolve<typeof CURRENT_LOCATION>(CURRENT_LOCATION) : lookUp(journey.origin.placeId, journey.origin.label ?? SAVED_PLACE_FALLBACK),
        lookUp(journey.destination.placeId, journey.destination.label ?? SAVED_PLACE_FALLBACK),
      ])
      onRepeat({ start, destination, travelMode: journey.travelMode })
    })
  }

  function saveEditor(current: Editor, label: string, place: LocationSelection | null) {
    const placeId = place?.placeId
    let result
    if (current.type === 'add') {
      if (placeId === undefined) return 'INVALID_PLACE' as const
      result = places.addSaved({ kind: current.kind, label, placeId })
    } else if (current.type === 'rename') {
      result = places.updateSaved(current.id, { label })
    } else {
      if (placeId === undefined) return 'INVALID_PLACE' as const
      result = places.updateSaved(current.id, { placeId })
    }
    if (!result.ok) return result.error
    setEditor(null)
    setMessage(null)
    return null
  }

  function renderEditor() {
    if (editor === null) return null
    if (editor.type === 'add') {
      const name = editor.kind === 'HOME' ? 'Home' : editor.kind === 'WORK' ? 'Work' : 'a place'
      return (
        <PlaceEditor
          key={`add-${editor.kind}`}
          title={editor.kind === 'CUSTOM' ? 'Save a place' : `Set ${name}`}
          showLabel={editor.kind === 'CUSTOM'}
          initialLabel=""
          showPlace
          onSave={(label, place) => saveEditor(editor, label, place)}
          onCancel={() => setEditor(null)}
        />
      )
    }
    const target = data.saved.find((place) => place.id === editor.id)
    if (!target) return null
    return (
      <PlaceEditor
        key={`${editor.type}-${editor.id}`}
        title={editor.type === 'rename' ? `Rename ${target.label}` : `Change place for ${target.label}`}
        showLabel={editor.type === 'rename'}
        initialLabel={target.label}
        showPlace={editor.type === 'place'}
        onSave={(label, place) => saveEditor(editor, label, place)}
        onCancel={() => setEditor(null)}
      />
    )
  }

  const limitReached = data.saved.length >= MAX_SAVED_PLACES
  const openOffline = openOfflineId !== null && offline !== undefined ? (offline.data.journeys.find((journey) => journey.id === openOfflineId) ?? null) : null

  if (openOffline !== null && offline !== undefined) {
    return (
      <FloatingPanel className="places-panel" aria-label="Saved journey">
        <div aria-live="polite">
          {message !== null && (
            <p className="places-panel__error" role="alert">
              {message}
            </p>
          )}
        </div>
        <OfflineJourneyDetails
          journey={openOffline}
          online={online}
          now={now}
          refreshing={busy === openOffline.id}
          onBack={() => setOpenOfflineId(null)}
          onRefresh={refreshOffline}
          onRemove={(journey) => {
            if (offline.remove(journey.id).ok) setOpenOfflineId(null)
          }}
        />
      </FloatingPanel>
    )
  }

  return (
    <FloatingPanel className="places-panel" aria-label="Saved places and recent journeys">
      <header className="places-panel__header">
        <h2 className="places-panel__title" tabIndex={-1} ref={headingRef}>
          Saved &amp; recent
        </h2>
        <button type="button" className="places-panel__close" aria-label="Close saved places and recent journeys" onClick={onClose}>
          <CloseIcon width={22} height={22} />
        </button>
      </header>

      <div aria-live="polite">
        {message !== null && (
          <p className="places-panel__error" role="alert">
            {message}
          </p>
        )}
        {!places.persisted && (
          <p className="places-panel__note">This browser is not keeping your places. They will be lost when you close the page.</p>
        )}
      </div>

      <section className="places-section" aria-labelledby="saved-places-heading">
        <div className="places-section__head">
          <h3 id="saved-places-heading" className="places-section__title">
            Saved places
          </h3>
          {data.saved.length > 0 && (
            <button type="button" className="places-panel__link" aria-pressed={managing} onClick={() => setManaging((on) => !on)}>
              {managing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>

        {managing ? (
          <ul className="saved-list">
            {data.saved.map((place) => (
              <li key={place.id} className="saved-list__row">
                <span className="saved-list__icon" aria-hidden="true">
                  {kindIcon(place.kind)}
                </span>
                <span className="saved-list__label">{place.label}</span>
                {place.kind === 'CUSTOM' && (
                  <button type="button" className="places-icon-button" aria-label={`Rename ${place.label}`} title="Rename" onClick={() => setEditor({ type: 'rename', id: place.id })}>
                    <EditIcon width={20} height={20} />
                  </button>
                )}
                <button type="button" className="places-panel__link" aria-label={`Change place for ${place.label}`} onClick={() => setEditor({ type: 'place', id: place.id })}>
                  Change
                </button>
                <button
                  type="button"
                  className="places-icon-button places-icon-button--danger"
                  aria-label={`Remove ${place.label}`}
                  title="Remove"
                  onClick={() => {
                    places.removeSaved(place.id)
                    if (editor !== null && editor.type !== 'add' && editor.id === place.id) setEditor(null)
                  }}
                >
                  <TrashIcon width={20} height={20} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="saved-chips">
            {([['HOME', home], ['WORK', work]] as const).map(([kind, place]) => (
              <li key={kind}>
                {place ? (
                  <button type="button" className="saved-chip" aria-busy={busy === place.id} aria-label={`Go to ${place.label}`} onClick={() => chooseSaved(place)}>
                    {kindIcon(kind)}
                    <span>{place.label}</span>
                  </button>
                ) : (
                  <button type="button" className="saved-chip saved-chip--empty" aria-label={`Set ${kind === 'HOME' ? 'Home' : 'Work'}`} onClick={() => setEditor({ type: 'add', kind })}>
                    {kindIcon(kind)}
                    <span>{kind === 'HOME' ? 'Set Home' : 'Set Work'}</span>
                  </button>
                )}
              </li>
            ))}
            {custom.map((place) => (
              <li key={place.id}>
                <button type="button" className="saved-chip" aria-busy={busy === place.id} aria-label={`Go to ${place.label}`} onClick={() => chooseSaved(place)}>
                  {kindIcon('CUSTOM')}
                  <span>{place.label}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="saved-chip saved-chip--add" aria-label="Add a place" aria-disabled={limitReached} onClick={() => (limitReached ? setMessage('You can save up to 20 places. Remove one to add another.') : setEditor({ type: 'add', kind: 'CUSTOM' }))}>
                <PlusIcon width={20} height={20} />
                <span>Add place</span>
              </button>
            </li>
          </ul>
        )}
        {data.saved.length === 0 && editor === null && <p className="places-panel__empty">Save the places you go to often, then reach them in one tap.</p>}
        {renderEditor()}
      </section>

      <section className="places-section" aria-labelledby="recent-journeys-heading">
        <div className="places-section__head">
          <h3 id="recent-journeys-heading" className="places-section__title">
            Recent journeys
          </h3>
          {data.recent.length > 0 &&
            (confirmClear ? (
              <span className="places-confirm" role="group" aria-label="Confirm clearing history">
                <button
                  type="button"
                  className="places-panel__link places-panel__link--danger"
                  onClick={() => {
                    places.clearRecent()
                    setConfirmClear(false)
                  }}
                >
                  Clear {data.recent.length}
                </button>
                <button type="button" className="places-panel__link" onClick={() => setConfirmClear(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="places-panel__link" onClick={() => setConfirmClear(true)}>
                Clear history
              </button>
            ))}
        </div>
        {data.recent.length === 0 ? (
          <p className="places-panel__empty">Journeys you search will appear here, so you can repeat them quickly.</p>
        ) : (
          <ul className="recent-list">
            {data.recent.map((journey) => {
              const ModeIcon = TRAVEL_MODE_ICONS[journey.travelMode]
              const when = new Date(journey.searchedAt)
              return (
                <li key={journey.id} className="recent-list__row">
                  <button
                    type="button"
                    className="recent-list__main"
                    aria-busy={busy === journey.id}
                    aria-label={`Repeat journey: ${describeRecent(journey)}`}
                    onClick={() => repeat(journey)}
                  >
                    <span className="recent-list__mode" aria-hidden="true">
                      <ModeIcon width={20} height={20} />
                    </span>
                    <span className="recent-list__text">
                      <span className="recent-list__route">
                        {originLabel(journey)} <span aria-hidden="true">→</span>
                        <span className="sr-only"> to </span> {journey.destination.label}
                      </span>
                      <span className="recent-list__meta">
                        {TRAVEL_MODE_INFO[journey.travelMode].label} · <time dateTime={when.toISOString()}>{formatSearchTime(journey.searchedAt, now)}</time>
                      </span>
                    </span>
                    <RepeatIcon className="recent-list__repeat" width={20} height={20} />
                  </button>
                  <button type="button" className="places-icon-button places-icon-button--danger" aria-label={`Remove from history: ${describeRecent(journey)}`} title="Remove" onClick={() => places.removeRecent(journey.id)}>
                    <TrashIcon width={20} height={20} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {offline !== undefined && (
        <OfflineJourneysSection offline={offline} now={now} onOpen={setOpenOfflineId} onRemoved={(id) => setOpenOfflineId((current) => (id === null || id === current ? null : current))} />
      )}

      <p className="places-panel__privacy">
        Kept only on this device, never sent anywhere. Recent journeys are removed after {RECENT_TTL_MS / DAY_MS} days. A start at your current location is saved as
        &ldquo;Current location&rdquo;, without coordinates.
        {offline !== undefined && ' Journeys saved for offline stay until you remove them; their place names are dropped after 30 days, and no map route or Google directions are ever kept.'}
      </p>
    </FloatingPanel>
  )
}
