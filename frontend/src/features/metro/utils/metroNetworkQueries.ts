import type { MetroLineRef, MetroNetwork, MetroNetworkLine, MetroNetworkStation } from '../types/metro.ts'

export interface StationLineInfo {
  line: MetroNetworkLine
  /** Direction label of the pattern the station was found on. */
  toward: string | null
  /** 1-based position along the pattern. */
  position: number
  total: number
  previous: string | null
  next: string | null
}

export interface NetworkIndex {
  stations: ReadonlyMap<string, MetroNetworkStation>
  lines: ReadonlyMap<string, MetroNetworkLine>
}

export function indexNetwork(network: MetroNetwork): NetworkIndex {
  return {
    stations: new Map(network.stations.map((station) => [station.id, station])),
    lines: new Map(network.lines.map((line) => [line.id, line])),
  }
}

/**
 * Where a station sits on each of its lines, from the imported station order: position, and the neighbouring
 * stations. The longest pattern of a line is used so that branches do not distort the position.
 */
export function stationSequence(network: MetroNetwork, index: NetworkIndex, stationId: string): StationLineInfo[] {
  const result: StationLineInfo[] = []
  for (const line of network.lines) {
    let best: StationLineInfo | null = null
    for (const pattern of line.patterns) {
      const at = pattern.stationIds.indexOf(stationId)
      if (at < 0) continue
      const before = at > 0 ? pattern.stationIds[at - 1] : undefined
      const after = pattern.stationIds[at + 1]
      if (best === null || pattern.stationIds.length > best.total) {
        best = {
          line,
          toward: pattern.toward,
          position: at + 1,
          total: pattern.stationIds.length,
          previous: before !== undefined ? (index.stations.get(before)?.name ?? null) : null,
          next: after !== undefined ? (index.stations.get(after)?.name ?? null) : null,
        }
      }
    }
    if (best !== null) result.push(best)
  }
  return result
}

export function networkLineRef(line: MetroNetworkLine): MetroLineRef {
  return { lineId: line.id, name: line.name, shortName: line.shortName, color: line.color, vehicleType: 'SUBWAY' }
}
