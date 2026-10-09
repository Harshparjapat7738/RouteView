import { useState } from 'react'
import { TrashIcon } from '../../../ui/Icons.tsx'
import { TRAVEL_MODE_ICONS } from '../../route/components/travelModeIcons.ts'
import { TRAVEL_MODE_INFO } from '../../route/types/travelMode.ts'
import { formatSearchTime } from '../../places/utils/recentFormat.ts'
import type { OfflineJourneysApi } from '../hooks/useOfflineJourneys.ts'
import type { OfflineJourney } from '../types/offline.ts'
import { assessFreshness } from '../utils/freshness.ts'
import { endpointLabel } from '../utils/endpointLabel.ts'
import './Offline.css'

interface OfflineJourneysSectionProps {
  offline: OfflineJourneysApi
  now: number
  onOpen: (id: string) => void
  /** Called after a removal so the parent can leave a details view that no longer exists. */
  onRemoved: (id: string | null) => void
}

function describe(journey: OfflineJourney): string {
  return `${endpointLabel(journey.origin)} to ${endpointLabel(journey.destination)}, ${TRAVEL_MODE_INFO[journey.travelMode].label}`
}

/** The journeys kept for offline use: open one, remove one, or clear them all (after a confirmation). */
export function OfflineJourneysSection({ offline, now, onOpen, onRemoved }: OfflineJourneysSectionProps) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const journeys = offline.data.journeys

  function remove(journey: OfflineJourney) {
    const outcome = offline.remove(journey.id)
    setMessage(outcome.ok ? { text: 'Removed from this device.', error: false } : { text: outcome.message, error: true })
    if (outcome.ok) onRemoved(journey.id)
  }

  function clearAll() {
    const outcome = offline.clear()
    setConfirmClear(false)
    setMessage(outcome.ok ? { text: 'All saved offline journeys were removed from this device.', error: false } : { text: outcome.message, error: true })
    if (outcome.ok) onRemoved(null)
  }

  return (
    <section className="places-section" aria-labelledby="offline-journeys-heading" data-offline-section="">
      <div className="places-section__head">
        <h3 id="offline-journeys-heading" className="places-section__title">
          Saved for offline
        </h3>
        {journeys.length > 0 &&
          (confirmClear ? (
            <span className="places-confirm" role="group" aria-label="Confirm removing saved offline journeys">
              <button type="button" className="places-panel__link places-panel__link--danger" onClick={clearAll}>
                Remove {journeys.length}
              </button>
              <button type="button" className="places-panel__link" onClick={() => setConfirmClear(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="places-panel__link" onClick={() => setConfirmClear(true)}>
              Clear saved
            </button>
          ))}
      </div>
      {offline.notice !== null && (
        <p className="places-panel__note" role="status">
          {offline.notice}{' '}
          <button type="button" className="places-panel__link" onClick={offline.dismissNotice}>
            Dismiss
          </button>
        </p>
      )}
      <p className="sr-only" role={message?.error ? 'alert' : 'status'}>
        {message?.text ?? ''}
      </p>
      {message?.error === true && <p className="places-panel__error">{message.text}</p>}
      {journeys.length === 0 ? (
        <p className="places-panel__empty">Save a journey from the Journey View to open it here without a connection. Bus journeys keep their stop sequence.</p>
      ) : (
        <ul className="recent-list">
          {journeys.map((journey) => {
            const ModeIcon = TRAVEL_MODE_ICONS[journey.travelMode]
            const freshness = assessFreshness(journey, now)
            return (
              <li key={journey.id} className="recent-list__row" data-offline-row="">
                <button type="button" className="recent-list__main" aria-label={`Open saved journey: ${describe(journey)}`} onClick={() => onOpen(journey.id)}>
                  <span className="recent-list__mode" aria-hidden="true">
                    <ModeIcon width={20} height={20} />
                  </span>
                  <span className="recent-list__text">
                    <span className="recent-list__route">
                      {endpointLabel(journey.origin)} <span aria-hidden="true">→</span>
                      <span className="sr-only"> to </span> {endpointLabel(journey.destination)}
                    </span>
                    <span className="recent-list__meta">
                      {TRAVEL_MODE_INFO[journey.travelMode].label} · {journey.itinerary !== null ? 'Stops saved' : 'Places only'} ·{' '}
                      <time dateTime={new Date(journey.savedAt).toISOString()}>{formatSearchTime(journey.savedAt, now)}</time>
                      {freshness.savedStale || freshness.serviceEnded ? ' · may be out of date' : ''}
                    </span>
                  </span>
                </button>
                <button type="button" className="places-icon-button places-icon-button--danger" aria-label={`Remove saved journey: ${describe(journey)}`} title="Remove" onClick={() => remove(journey)}>
                  <TrashIcon width={20} height={20} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
