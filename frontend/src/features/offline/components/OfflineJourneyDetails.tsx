import { useEffect, useRef } from 'react'
import { ArrowLeftIcon } from '../../../ui/Icons.tsx'
import { summarizePreferences } from '../../preferences/utils/describePreferences.ts'
import { TRAVEL_MODE_INFO } from '../../route/types/travelMode.ts'
import { CURRENT_LOCATION_ORIGIN, type OfflineIntentReason, type OfflineJourney, type OfflineStep } from '../types/offline.ts'
import { assessFreshness, formatSavedAt } from '../utils/freshness.ts'
import { endpointLabel } from '../utils/endpointLabel.ts'
import { dataSourceName } from '../utils/offlinePolicy.ts'
import './Offline.css'

const INTENT_EXPLANATIONS: Readonly<Record<OfflineIntentReason, string>> = {
  GOOGLE_CONTENT:
    'Only the places and travel mode are kept. The route, directions, times and fares come from Google and cannot be stored, so full directions need a connection.',
  DATA_TERMS: 'Only the places and travel mode are kept: the terms for the transit data are not confirmed to allow keeping its timetable on this device.',
  NO_ITINERARY: 'Only the places and travel mode are kept: the bus journey had no complete stop sequence to save. Full directions need a connection.',
}

function walkText(step: Extract<OfflineStep, { type: 'WALK' }>): string {
  const about = step.minutes === null ? '' : ` about ${step.minutes} min`
  return step.role === 'FIRST_MILE' ? `Walk${about} to the first stop` : `Walk${about} to your destination`
}

function Step({ step }: { step: OfflineStep }) {
  if (step.type === 'WALK') {
    return (
      <li className="offline-step" data-kind="walk">
        <p className="offline-step__title">{walkText(step)}</p>
        <p className="offline-step__meta">Straight-line estimate.</p>
      </li>
    )
  }
  if (step.type === 'TRANSFER') {
    return (
      <li className="offline-step" data-kind="transfer">
        <p className="offline-step__title">Change at {step.stop}</p>
        <p className="offline-step__meta">
          {step.fromRoute !== null && step.toRoute !== null ? `From ${step.fromRoute} to ${step.toRoute}. ` : ''}
          {step.waitMinutes !== null ? `Scheduled wait about ${step.waitMinutes} min.` : ''}
        </p>
      </li>
    )
  }
  const first = step.stops[0] ?? ''
  const last = step.stops[step.stops.length - 1] ?? ''
  const hops = step.stops.length - 1
  return (
    <li className="offline-step" data-kind="bus">
      <p className="offline-step__title">
        Bus {step.route}
        {step.headsign !== null ? ` towards ${step.headsign}` : ''}
      </p>
      <p className="offline-step__meta">
        Board at {first}. Get off at {last}. {hops} {hops === 1 ? 'stop' : 'stops'}.
        {step.departure !== null && step.arrival !== null ? ` Scheduled ${step.departure} to ${step.arrival} (Delhi time), as saved.` : ''}
        {step.agency !== null ? ` ${step.agency}.` : ''}
      </p>
      <details className="offline-step__stops">
        <summary>Stops in order</summary>
        <ol>
          {step.stops.map((stop, index) => (
            <li key={index}>{stop}</li>
          ))}
        </ol>
      </details>
    </li>
  )
}

interface OfflineJourneyDetailsProps {
  journey: OfflineJourney
  online: boolean
  /** The time the view opened; the age of the copy is relative to it. */
  now: number
  refreshing: boolean
  onBack: () => void
  onRefresh: (journey: OfflineJourney) => void
  onRemove: (journey: OfflineJourney) => void
}

/**
 * A saved journey as it was kept, with when and from which data it was saved. Offline it never pretends to be live: schedules are
 * labelled as saved, there is no map (no route geometry is stored), and live service, delays and fares are said to be unavailable.
 */
export function OfflineJourneyDetails({ journey, online, now, refreshing, onBack, onRefresh, onRemove }: OfflineJourneyDetailsProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  const itinerary = journey.itinerary
  const freshness = assessFreshness(journey, now)
  const preferenceText = summarizePreferences(journey.preferences)
  const hasPreferences = preferenceText !== 'Default order'

  return (
    <section className="offline-details" aria-label="Saved journey" data-offline-details="">
      <button type="button" className="offline-details__back" onClick={onBack}>
        <ArrowLeftIcon width={18} height={18} /> Saved journeys
      </button>
      <h3 className="offline-details__title" tabIndex={-1} ref={headingRef}>
        {endpointLabel(journey.origin)} <span aria-hidden="true">→</span>
        <span className="sr-only"> to </span> {endpointLabel(journey.destination)}
      </h3>
      <p className="offline-details__mode">{TRAVEL_MODE_INFO[journey.travelMode].label}</p>

      <p className={`offline-details__status${online ? '' : ' offline-details__status--offline'}`} role="status" data-offline-status="">
        {online
          ? 'You are online. Refresh to calculate this journey again with live data.'
          : "You're offline, so a live calculation isn't available. This is the copy saved on this device."}
      </p>

      <dl className="offline-details__facts">
        <div>
          <dt>Saved</dt>
          <dd>
            <time dateTime={new Date(journey.savedAt).toISOString()}>{formatSavedAt(journey.savedAt)}</time> · {freshness.savedAgo.replace('Saved ', '')}
          </dd>
        </div>
        {itinerary !== null && (
          <>
            <div>
              <dt>Source</dt>
              <dd>{dataSourceName(itinerary.source)}</dd>
            </div>
            <div>
              <dt>Data version</dt>
              <dd data-offline-dataset="">{itinerary.datasetVersion ?? 'Not reported'}</dd>
            </div>
            {itinerary.datasetImportedAt !== null && (
              <div>
                <dt>Data imported</dt>
                <dd>{itinerary.datasetImportedAt.slice(0, 10)}</dd>
              </div>
            )}
          </>
        )}
        {hasPreferences && (
          <div>
            <dt>Preferences when saved</dt>
            <dd>{preferenceText}</dd>
          </div>
        )}
      </dl>

      {freshness.warnings.length > 0 && (
        <ul className="offline-details__warnings" data-offline-stale="">
          {freshness.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {itinerary !== null ? (
        <>
          <p className="offline-details__caveat">
            Schedules and times are from the saved timetable and may be out of date. Live bus positions, delays, fares and service status are not available offline.
          </p>
          {journey.origin === CURRENT_LOCATION_ORIGIN && (
            <p className="offline-details__caveat">The walk from your current location is not saved: your position is never kept.</p>
          )}
          <ol className="offline-steps">
            {itinerary.steps.map((step, index) => (
              <Step key={index} step={step} />
            ))}
          </ol>
          <p className="offline-details__caveat">
            No map is shown: only the stop sequence is saved, not a route line.
          </p>
        </>
      ) : (
        <p className="offline-details__intent" data-offline-intent="">
          {INTENT_EXPLANATIONS[journey.intentReason ?? 'GOOGLE_CONTENT']}
        </p>
      )}

      <div className="offline-details__actions">
        <button type="button" className="offline-details__action" disabled={!online || refreshing} aria-busy={refreshing} onClick={() => onRefresh(journey)}>
          {online ? 'Refresh with live data' : 'Refresh needs a connection'}
        </button>
        <button type="button" className="offline-details__action offline-details__action--danger" onClick={() => onRemove(journey)}>
          Remove from this device
        </button>
      </div>
    </section>
  )
}
