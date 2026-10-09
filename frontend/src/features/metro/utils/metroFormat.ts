import type { MetroDatasetRef, MetroFare, MetroJourney, MetroLineRef, MetroSegment, MetroStationRef } from '../types/metro.ts'

/** "₹40" for rupees, otherwise "USD 4.5". Only ever formats a fare the provider reported. */
export function formatFare(fare: MetroFare | null): string {
  if (fare === null) {
    return 'Fare unavailable'
  }
  return fare.currency === 'INR' ? `₹${fare.amount}` : `${fare.currency} ${fare.amount}`
}

export function describeInterchanges(transfers: number): string {
  if (transfers <= 0) return 'Direct'
  return `${transfers} ${transfers === 1 ? 'interchange' : 'interchanges'}`
}

export function describeStations(count: number | null): string | null {
  return count === null ? null : `${count} ${count === 1 ? 'station' : 'stations'}`
}

/** "9 stops" - station-to-station segments travelled, not the number of stations listed. */
export function describeStops(count: number | null | undefined): string | null {
  return count === null || count === undefined || count <= 0 ? null : `${count} ${count === 1 ? 'stop' : 'stops'}`
}

/** Text identification of a line: never colour alone. "Blue Line", or "Blue Line (B)" when a different short name exists. */
export function lineLabel(line: MetroLineRef | null): string {
  if (line === null) return 'Metro'
  const name = line.name !== '' ? line.name : 'Metro'
  return line.shortName !== '' && line.shortName.toLowerCase() !== name.toLowerCase() && !name.toLowerCase().includes(line.shortName.toLowerCase())
    ? `${name} (${line.shortName})`
    : name
}

/** A key that identifies a station across the journey, the timeline and the map. */
export function stationKey(station: Pick<MetroStationRef, 'stationId' | 'name' | 'latitude' | 'longitude'>): string {
  return station.stationId ?? `p:${station.name}@${station.latitude ?? '?'},${station.longitude ?? '?'}`
}

/** The metro rides of a journey in order. */
export function metroRides(journey: MetroJourney): MetroSegment[] {
  return journey.segments.filter((segment) => segment.type === 'METRO')
}

/** First station name of a metro journey (where the person boards) and last (where they leave), when known. */
export function boardingStation(journey: MetroJourney): MetroStationRef | null {
  return journey.segments.find((segment) => segment.type === 'METRO' || segment.type === 'TRANSIT')?.boarding ?? null
}

export function exitStation(journey: MetroJourney): MetroStationRef | null {
  const rides = journey.segments.filter((segment) => segment.type === 'METRO' || segment.type === 'TRANSIT')
  return rides[rides.length - 1]?.exit ?? null
}

/** Accessible one-line description of a station for screen readers. */
export function describeStation(station: MetroStationRef): string {
  const role =
    station.role === 'BOARDING' ? 'boarding station' : station.role === 'EXIT' ? 'exit station' : station.role === 'INTERCHANGE' ? 'interchange' : 'station'
  const lines = station.lines.map((line) => lineLabel(line))
  return `${station.name}, ${role}${lines.length > 0 ? `, ${lines.join(', ')}` : ''}`
}

/** "Rajiv Chowk → Blue Line → Mandi House → Yellow Line → Central Secretariat". */
export function describeMetroPath(journey: MetroJourney): string {
  const parts: string[] = []
  for (const segment of journey.segments) {
    if ((segment.type === 'METRO' || segment.type === 'TRANSIT') && segment.boarding && segment.exit) {
      if (parts.length === 0) parts.push(segment.boarding.name)
      parts.push(lineLabel(segment.line), segment.exit.name)
    }
  }
  return parts.join(' → ')
}

const DAY_MS = 86_400_000
/** Static data older than this is flagged as possibly out of date. */
export const STALE_AFTER_DAYS = 365

/** How old the dataset is, in days, from its publisher's date; null when the publisher gave no date. */
export function datasetAgeDays(dataset: MetroDatasetRef | null, now: number): number | null {
  if (dataset?.sourceUpdatedAt == null) return null
  const published = Date.parse(`${dataset.sourceUpdatedAt}T00:00:00Z`)
  return Number.isNaN(published) ? null : Math.floor((now - published) / DAY_MS)
}

export function isDatasetStale(dataset: MetroDatasetRef | null, now: number): boolean {
  const age = datasetAgeDays(dataset, now)
  return age !== null && age > STALE_AFTER_DAYS
}

/** The honest description of where station data comes from: static, with its version and date, never real time. */
export function describeDataset(dataset: MetroDatasetRef | null, now: number): string {
  if (dataset === null) {
    return 'Station information comes from the routing provider only.'
  }
  const published = dataset.sourceUpdatedAt !== null ? `, published ${dataset.sourceUpdatedAt}` : ''
  const stale = isDatasetStale(dataset, now) ? ' This data may not include recent changes.' : ''
  return `Station data: ${dataset.source} ${dataset.sourceVersion}${published}. Static data, not real time.${stale}${describeServicePeriod(dataset, now)}`
}

/** The dataset's own calendar, and whether it has ended. Shown as a fact about the data: it is never read as a current timetable. */
export function describeServicePeriod(dataset: MetroDatasetRef, now: number): string {
  const start = dataset.servicePeriodStart ?? null
  const end = dataset.servicePeriodEnd ?? null
  if (start === null || end === null) return ''
  const ended = Date.parse(`${end}T23:59:59Z`) < now
  return ended
    ? ` The dataset's service calendar (${start} to ${end}) has ended, so train times are not implied.`
    : ` Dataset service calendar: ${start} to ${end}.`
}
