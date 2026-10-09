import { CURRENT_LOCATION, type RecentJourney } from '../types/places.ts'
import { TRAVEL_MODE_INFO } from '../../route/types/travelMode.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "5 days ago": plain and locale-neutral. */
export function formatSearchTime(then: number, now: number): string {
  const age = Math.max(0, now - then)
  if (age < MINUTE) return 'Just now'
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`
  if (age < DAY) return `${Math.floor(age / HOUR)} h ago`
  const days = Math.floor(age / DAY)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

export const CURRENT_LOCATION_LABEL = 'Current location'

export function originLabel(journey: Pick<RecentJourney, 'origin'>): string {
  return journey.origin === CURRENT_LOCATION ? CURRENT_LOCATION_LABEL : journey.origin.label
}

export function describeRecent(journey: RecentJourney): string {
  return `${originLabel(journey)} to ${journey.destination.label}, ${TRAVEL_MODE_INFO[journey.travelMode].label}`
}
