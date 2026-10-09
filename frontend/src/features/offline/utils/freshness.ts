import { formatSearchTime } from '../../places/utils/recentFormat.ts'
import type { OfflineJourney } from '../types/offline.ts'
import { DATASET_OLD_AFTER_MS, STALE_AFTER_MS } from './offlinePolicy.ts'

export interface Freshness {
  /** "Saved 3 days ago". */
  savedAgo: string
  /** The saved copy is older than the stale threshold. */
  savedStale: boolean
  /** The dataset's own calendar ended before now: its timetable no longer applies. */
  serviceEnded: boolean
  /** The dataset was imported long ago (or its import time is unknown, which is reported separately). */
  datasetOld: boolean
  /** The backend never reported when the dataset was imported. */
  datasetAgeUnknown: boolean
  /** Plain sentences for the reader, most important first. Empty when nothing is worth saying. */
  warnings: string[]
}

function endOfDay(day: string): number {
  // The calendar day in Delhi time ends at 18:30 UTC the same date.
  return Date.parse(`${day}T23:59:59+05:30`)
}

/** Every transit detail offline is a schedule from the time of saving: this says how much to trust it, never that it is current. */
export function assessFreshness(journey: OfflineJourney, now: number): Freshness {
  const itinerary = journey.itinerary
  const savedAge = Math.max(0, now - journey.savedAt)
  const savedStale = savedAge >= STALE_AFTER_MS
  const serviceEnded = itinerary?.servicePeriodEnd != null && now > endOfDay(itinerary.servicePeriodEnd)
  const imported = itinerary?.datasetImportedAt != null ? Date.parse(itinerary.datasetImportedAt) : null
  const datasetOld = imported !== null && now - imported >= DATASET_OLD_AFTER_MS
  const datasetAgeUnknown = itinerary !== null && imported === null
  const warnings: string[] = []
  if (serviceEnded && itinerary?.servicePeriodEnd) warnings.push(`The timetable data covers service only until ${itinerary.servicePeriodEnd}, so this itinerary is probably out of date.`)
  if (savedStale) warnings.push(`This copy was saved ${formatSearchTime(journey.savedAt, now).toLowerCase()}. Check it again when you are online.`)
  if (datasetOld) warnings.push('The transit dataset it was planned from is more than six months old.')
  return { savedAgo: `Saved ${formatSearchTime(journey.savedAt, now).toLowerCase()}`, savedStale, serviceEnded, datasetOld, datasetAgeUnknown, warnings }
}

/** Compares a freshly calculated journey's dataset with the saved copy; null when they cannot be compared. */
export function datasetChanged(saved: OfflineJourney, currentVersion: string | null): boolean | null {
  const version = saved.itinerary?.datasetVersion ?? null
  if (version === null || currentVersion === null) return null
  return version !== currentVersion
}

export function formatSavedAt(savedAt: number): string {
  return new Date(savedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
