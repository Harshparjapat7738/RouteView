import type { MetroJourney, MetroLineRef, MetroSegment, MetroStationRef } from '../types/metro.ts'

export const blue: MetroLineRef = { lineId: 'l-blue', name: 'Blue Line', shortName: 'Blue', color: '#0000FF', vehicleType: 'SUBWAY' }
export const yellow: MetroLineRef = { lineId: 'l-yellow', name: 'Yellow Line', shortName: 'Yellow', color: '#FFD700', vehicleType: 'SUBWAY' }

export const station = (id: string | null, name: string, role: MetroStationRef['role'], lines: MetroLineRef[] = []): MetroStationRef => ({
  stationId: id, name, latitude: 28.6, longitude: 77.2, role, lines,
})

const seg = (over: Partial<MetroSegment>): MetroSegment => ({
  type: 'WALK', walkRole: null, distanceMeters: 0, durationSeconds: 0, line: null, towards: null, boarding: null, exit: null,
  stopCount: 0, intermediateStations: null, departureTime: null, arrivalTime: null, transferStation: null, transferToStation: null,
  fromLine: null, toLine: null, transferWalkMeters: null, transferWalkSeconds: null, ...over,
})

export function journey(over: Partial<MetroJourney> = {}): MetroJourney {
  const a = station('s-a', 'Alpha', 'BOARDING', [blue])
  const central = station('s-c', 'Central', 'INTERCHANGE', [blue, yellow])
  const z = station('s-z', 'Zulu', 'EXIT', [yellow])
  return {
    fare: { currency: 'INR', amount: '40' },
    transfers: 1, stationCount: 5, walkingMeters: 600, walkingSeconds: 480,
    departureTime: null, arrivalTime: null, stationsVerified: true,
    segments: [
      seg({ type: 'WALK', walkRole: 'FIRST_MILE', distanceMeters: 300, durationSeconds: 240 }),
      seg({ type: 'METRO', line: blue, towards: 'Dwarka', boarding: a, exit: central, stopCount: 2, durationSeconds: 600, intermediateStations: [station('s-b', 'Bravo', 'INTERMEDIATE', [blue])] }),
      seg({ type: 'TRANSFER', transferStation: central, fromLine: blue, toLine: yellow, transferWalkMeters: 80, transferWalkSeconds: 90 }),
      seg({ type: 'METRO', line: yellow, towards: 'Huda', boarding: central, exit: z, stopCount: 3, durationSeconds: 700, intermediateStations: [] }),
      seg({ type: 'WALK', walkRole: 'LAST_MILE', distanceMeters: 300, durationSeconds: 240 }),
    ],
    stations: [a, station('s-b', 'Bravo', 'INTERMEDIATE', [blue]), central, z],
    dataset: { source: 'DMRC GTFS', sourceVersion: '2023-08-10', sourceUpdatedAt: '2023-08-10', importedAt: null },
    notices: [],
    ...over,
  }
}
