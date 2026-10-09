import type { MetroJourney, MetroLineRef, MetroNetwork, MetroNetworkLine, MetroNetworkStation, MetroStationRef } from '../types/metro.ts'
import { lineLabel, stationKey } from './metroFormat.ts'

/** Neutral colour for a line the dataset gave no colour for: never an invented brand colour. */
export const NEUTRAL_LINE_COLOR = '#6b7280'

export type MapStationRole = 'network' | 'journey' | 'boarding' | 'interchange' | 'exit'

export interface MapStationLine {
  label: string
  color: string | null
}

/** A station drawn on the map: a network dot or a station of the selected journey. */
export interface MapStation {
  key: string
  name: string
  position: { lat: number; lng: number }
  role: MapStationRole
  /** Interchange according to the dataset (also drawn larger on the network layer). */
  interchange: boolean
  lines: readonly MapStationLine[]
}

export interface MapMetroLine {
  id: string
  /** The logical line (Blue main + Vaishali share it); null for an older backend. */
  groupId: string | null
  label: string
  color: string
  /** The dataset's shapes when the service has any, otherwise ordered station-to-station connections (not the rail alignment). */
  paths: readonly (readonly { lat: number; lng: number }[])[]
}

function toLines(lines: readonly MetroLineRef[]): MapStationLine[] {
  return lines.map((line) => ({ label: lineLabel(line), color: line.color }))
}

/** Network stations for the map layer. Keys match the journey stations' keys (the dataset station id). */
export function networkStations(network: MetroNetwork): MapStation[] {
  const lines = new Map(network.lines.map((line) => [line.id, line]))
  const groups = new Map<string, MetroNetworkLine>()
  for (const line of network.lines) {
    if (line.groupId != null && !groups.has(line.groupId)) groups.set(line.groupId, line)
  }
  return network.stations.map((station) => ({
    key: station.id,
    name: station.name,
    position: { lat: station.latitude, lng: station.longitude },
    role: 'network',
    interchange: station.interchange,
    lines: stationLines(station, lines, groups),
  }))
}

/** A station lists each LOGICAL line once (Blue main + Vaishali is one "Blue Line"); older backends fall back to services. */
function stationLines(
  station: MetroNetworkStation,
  lines: ReadonlyMap<string, MetroNetworkLine>,
  groups: ReadonlyMap<string, MetroNetworkLine>,
): MapStationLine[] {
  const groupIds = station.groupIds ?? []
  if (groupIds.length > 0) {
    return groupIds.flatMap((id) => {
      const line = groups.get(id)
      return line ? [{ label: line.groupName ?? line.name, color: line.color }] : []
    })
  }
  return station.lineIds.flatMap((id) => {
    const line = lines.get(id)
    return line ? [{ label: lineLabel({ lineId: id, name: line.name, shortName: line.shortName, color: line.color, vehicleType: 'SUBWAY' }), color: line.color }] : []
  })
}

export function networkLines(network: MetroNetwork): MapMetroLine[] {
  const stations = new Map(network.stations.map((station) => [station.id, station]))
  return network.lines.map((line) => {
    const shapes = (line.shapes ?? []).filter((path) => path.length >= 2)
    return {
      id: line.id,
      groupId: line.groupId ?? null,
      label: line.name,
      color: line.color ?? NEUTRAL_LINE_COLOR,
      // A valid shape is the real alignment; a straight station-to-station line is only the fallback for a service without one.
      paths:
        shapes.length > 0
          ? shapes
          : line.patterns
              .map((pattern) =>
                pattern.stationIds.flatMap((id) => {
                  const station = stations.get(id)
                  return station ? [{ lat: station.latitude, lng: station.longitude }] : []
                }),
              )
              .filter((path) => path.length >= 2),
    }
  })
}

function journeyRole(station: MetroStationRef): MapStationRole {
  switch (station.role) {
    case 'BOARDING':
      return 'boarding'
    case 'EXIT':
      return 'exit'
    case 'INTERCHANGE':
      return 'interchange'
    default:
      return 'journey'
  }
}

/** The stations of the selected journey that have coordinates (stations without a position cannot be drawn). */
export function journeyStations(journey: MetroJourney | undefined): MapStation[] {
  if (journey === undefined) return []
  const seen = new Set<string>()
  const result: MapStation[] = []
  for (const station of journey.stations) {
    if (station.latitude === null || station.longitude === null) continue
    const key = stationKey(station)
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      key,
      name: station.name,
      position: { lat: station.latitude, lng: station.longitude },
      role: journeyRole(station),
      interchange: station.role === 'INTERCHANGE' || station.interchange === true,
      lines: toLines(station.lines),
    })
  }
  return result
}

/**
 * The dataset ids the selected journey rides - the service id and the logical-line id of every ride; the network layer
 * de-emphasises every other line. A ride on the Blue trunk keeps both Blue services of the logical line emphasised.
 */
export function journeyLineIds(journey: MetroJourney | undefined): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const segment of journey?.segments ?? []) {
    if (segment.line?.lineId) ids.add(segment.line.lineId)
    if (segment.line?.groupId) ids.add(segment.line.groupId)
  }
  return ids
}

/** Whether a network line is part of the journey (by service id or logical line id, never by name). */
export function isJourneyLine(line: Pick<MapMetroLine, 'id' | 'groupId'>, ids: ReadonlySet<string>): boolean {
  return ids.has(line.id) || (line.groupId !== null && ids.has(line.groupId))
}

/** Zoom levels at which network stations appear: interchanges first, every station once the map is close enough. */
export const INTERCHANGE_MIN_ZOOM = 11
export const STATION_MIN_ZOOM = 13
export const LABEL_MIN_ZOOM = 15

export function visibleNetworkStation(station: Pick<MapStation, 'interchange'>, zoom: number): boolean {
  return zoom >= STATION_MIN_ZOOM || (station.interchange && zoom >= INTERCHANGE_MIN_ZOOM)
}
