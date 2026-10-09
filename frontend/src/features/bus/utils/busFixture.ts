/** A backend-shaped bus journey for tests: Walk → Bus 216 → Transfer → Bus 171 → Walk. Not real data. */

// The three points of the polyline-algorithm documentation example.
const LINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'

const stop = (id: string, name: string, role: string, lat: number, lon: number) => ({ stopId: id, gtfsId: `g-${id}`, name, latitude: lat, longitude: lon, role })
export const A = stop('a', 'Stop A', 'BOARDING', 28.6, 77.2)
export const B = stop('b', 'Stop B', 'INTERMEDIATE', 28.61, 77.21)
export const C = stop('c', 'Stop C', 'TRANSFER', 28.62, 77.22)
export const C2 = stop('c', 'Stop C', 'BOARDING', 28.62, 77.22)
export const D = stop('d', 'Stop D', 'INTERMEDIATE', 28.63, 77.23)
export const E = stop('e', 'Stop E', 'EXIT', 28.64, 77.24)

const route = (name: string) => ({ routeId: `r-${name}`, gtfsId: name, name, shortName: name, longName: null, agency: 'DTC' })

const walk = (role: string, meters: number) => ({
  type: 'WALK', walkRole: role, distanceMeters: meters, durationSeconds: Math.round(meters / 1.25), geometry: LINE, estimated: true,
  stops: [], listedStopCount: 0, stopToStopSegments: 0, waitSeconds: 0,
})

export function rawBusJourney(over: Record<string, unknown> = {}) {
  return {
    transfers: 1,
    busLegCount: 2,
    listedStopCount: 5,
    stopToStopSegments: 3,
    walkingMeters: 400,
    walkingSeconds: 320,
    rideSeconds: 1500,
    waitSeconds: 420,
    departureTime: '2026-10-12T08:00:00+05:30',
    arrivalTime: '2026-10-12T08:50:00+05:30',
    fare: null,
    fareStatus: 'UNAVAILABLE',
    timetableBasis: 'STATIC_SCHEDULE',
    geometrySource: 'STOP_SEQUENCE',
    segments: [
      walk('FIRST_MILE', 200),
      {
        type: 'BUS', route: route('216DOWN'), headsign: 'Kashmere Gate', headsignSource: 'GTFS_TRIP', boarding: A, exit: C, stops: [A, B, C],
        listedStopCount: 3, stopToStopSegments: 2, departureTime: '2026-10-12T08:05:00+05:30', arrivalTime: '2026-10-12T08:20:00+05:30',
        distanceMeters: 4000, durationSeconds: 900, waitSeconds: 120, geometry: LINE, estimated: false,
      },
      { type: 'TRANSFER', distanceMeters: 0, durationSeconds: 0, transferStop: C, fromRoute: route('216DOWN'), toRoute: route('171UP'), stops: [], waitSeconds: 300, listedStopCount: 0, stopToStopSegments: 0 },
      {
        type: 'BUS', route: route('171UP'), headsign: 'Okhla', headsignSource: 'TERMINAL_STOP', boarding: C2, exit: E, stops: [C2, D, E],
        listedStopCount: 3, stopToStopSegments: 2, departureTime: '2026-10-12T08:25:00+05:30', arrivalTime: '2026-10-12T08:45:00+05:30',
        distanceMeters: 5000, durationSeconds: 1200, waitSeconds: 300, geometry: LINE, estimated: false,
      },
      walk('LAST_MILE', 200),
    ],
    stops: [A, B, C, D, E],
    dataset: { sourceVersion: 'v-real' },
    notices: ['Times are the scheduled timetable, not live arrival predictions.'],
    ...over,
  }
}
