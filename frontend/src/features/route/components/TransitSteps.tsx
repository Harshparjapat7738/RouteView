import type { TransitDetails } from '../types/transit.ts'
import { formatClock, vehicleLabel } from '../utils/transitSummary.ts'
import { formatDistance, formatDuration } from '../utils/formatRoute.ts'
import './TransitSteps.css'

/** The ride and walking parts of the selected transit route, exactly as the provider reported them. */
export function TransitSteps({ transit }: { transit: TransitDetails }) {
  return (
    <ol className="transit-steps" aria-label="Transit steps">
      {transit.steps.map((step, index) => {
        const departs = formatClock(step.departureTime)
        const arrives = formatClock(step.arrivalTime)
        return (
          <li key={index} className="transit-steps__item" data-kind={step.kind}>
            {step.kind === 'walk' ? (
              <span>
                Walk {formatDistance(step.distanceMeters)} · {formatDuration(step.durationSeconds)}
              </span>
            ) : (
              <span>
                <strong>{step.lineName !== '' ? step.lineName : vehicleLabel(step.vehicleType)}</strong>
                {step.lineName !== '' && ` (${vehicleLabel(step.vehicleType)})`}
                {step.headsign !== '' && ` towards ${step.headsign}`}
                <br />
                {step.departureStop}
                {departs !== '' && ` ${departs}`} → {step.arrivalStop}
                {arrives !== '' && ` ${arrives}`}
                {step.stopCount > 0 && ` · ${step.stopCount} ${step.stopCount === 1 ? 'stop' : 'stops'}`}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
