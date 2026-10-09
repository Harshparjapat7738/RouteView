import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseBusStopsInWindow } from './parseBusStops.ts'
import { rawBusJourney } from './busFixture.ts'
import {
  busRouteChain,
  describeBusNoRoute,
  describeBusStops,
  describeBusTransfers,
  describeDirection,
  describeJourneyShape,
  firstBoarding,
  formatBusClock,
  formatBusFare,
  lastExit,
  totalRidingStops,
  busRides,
} from './busFormat.ts'
import { parseBusJourney, parseNoRouteReason } from './parseBus.ts'

describe('bus journey parsing', () => {
  it('keeps the parts in order and the real ordered stops of every ride', () => {
    const journey = parseBusJourney(rawBusJourney())
    assert.ok(journey)
    assert.equal(describeJourneyShape(journey), 'Walk → Bus → Transfer → Bus → Walk')
    assert.deepEqual(busRides(journey).map((ride) => ride.route?.name), ['216DOWN', '171UP'])
    assert.deepEqual(busRides(journey)[0]?.stops.map((s) => s.name), ['Stop A', 'Stop B', 'Stop C'])
    assert.equal(busRouteChain(journey), '216DOWN → 171UP')
    assert.equal(journey.timetableBasis, 'STATIC_SCHEDULE')
    assert.equal(journey.datasetVersion, 'v-real')
  })

  it('keeps what the backend reported about the dataset (source, import time, service period) and drops malformed values', () => {
    const reported = parseBusJourney(
      rawBusJourney({ dataset: { source: 'DELHI_BUS', sourceVersion: 'v1', importedAt: '2026-09-01T10:00:00Z', servicePeriodStart: '2024-01-01', servicePeriodEnd: '2027-01-01' } }),
    )
    assert.deepEqual(reported?.datasetInfo, { source: 'DELHI_BUS', sourceVersion: 'v1', importedAt: '2026-09-01T10:00:00Z', servicePeriodStart: '2024-01-01', servicePeriodEnd: '2027-01-01' })
    const odd = parseBusJourney(rawBusJourney({ dataset: { source: 5, sourceVersion: 'v1', importedAt: 'yesterday', servicePeriodStart: '2024-13-45', servicePeriodEnd: '2027/01/01' } }))
    assert.deepEqual(odd?.datasetInfo, { source: null, sourceVersion: 'v1', importedAt: null, servicePeriodStart: null, servicePeriodEnd: null })
    assert.equal(parseBusJourney(rawBusJourney({ dataset: undefined }))?.datasetInfo, null)
  })

  it('decodes the geometry of each part and does not invent one when it is missing or broken', () => {
    const journey = parseBusJourney(rawBusJourney())
    assert.equal(journey?.segments[0]?.path.length, 3)
    assert.equal(journey?.segments[2]?.path.length, 0)
    const raw = rawBusJourney()
    ;(raw.segments[0] as { geometry: string }).geometry = '!!not a polyline!!'
    assert.equal(parseBusJourney(raw)?.segments[0]?.path.length, 0)
  })

  it('counts stops ridden (hops after boarding), not the listed stops', () => {
    const journey = parseBusJourney(rawBusJourney())
    assert.ok(journey)
    assert.equal(totalRidingStops(journey), 4)
    assert.equal(journey.listedStopCount, 5)
    assert.equal(describeBusStops(totalRidingStops(journey)), '4 stops')
    assert.equal(firstBoarding(journey), 'Stop A')
    assert.equal(lastExit(journey), 'Stop E')
  })

  it('never invents a fare: only a well-formed currency and amount is kept', () => {
    assert.equal(formatBusFare(parseBusJourney(rawBusJourney())?.fare ?? null), 'Fare unavailable')
    assert.equal(parseBusJourney(rawBusJourney({ fare: { currency: 'INR', amount: '25.00' } }))?.fare?.amount, '25.00')
    assert.equal(formatBusFare({ currency: 'INR', amount: '25.00' }), 'INR 25.00')
    assert.equal(parseBusJourney(rawBusJourney({ fare: { currency: 'rupees', amount: 'a lot' } }))?.fare, null)
  })

  it('names the direction only when there is one', () => {
    const rides = busRides(parseBusJourney(rawBusJourney())!)
    assert.equal(describeDirection(rides[0]!), 'Towards Kashmere Gate')
    assert.equal(rides[1]?.headsignIsTerminal, true)
    const raw = rawBusJourney()
    ;(raw.segments[1] as { headsign: unknown }).headsign = null
    assert.equal(describeDirection(busRides(parseBusJourney(raw)!)[0]!), null)
  })

  it('rejects a malformed journey instead of showing a guess', () => {
    assert.equal(parseBusJourney(null), undefined)
    assert.equal(parseBusJourney(rawBusJourney({ transfers: -1 })), undefined)
    assert.equal(parseBusJourney(rawBusJourney({ segments: [] })), undefined)
    const noBoarding = rawBusJourney()
    ;(noBoarding.segments[1] as { boarding: unknown }).boarding = null
    assert.equal(parseBusJourney(noBoarding), undefined)
    const noRoute = rawBusJourney()
    ;(noRoute.segments[1] as { route: unknown }).route = null
    assert.equal(parseBusJourney(noRoute), undefined)
  })

  it('keeps the transfer stop and both routes of a change', () => {
    const transfer = parseBusJourney(rawBusJourney())?.segments[2]
    assert.equal(transfer?.type, 'TRANSFER')
    assert.equal(transfer?.transferStop?.name, 'Stop C')
    assert.equal(transfer?.fromRoute?.name, '216DOWN')
    assert.equal(transfer?.toRoute?.name, '171UP')
  })

  it('describes transfers, stops and the schedule in plain words', () => {
    assert.equal(describeBusTransfers(0), 'Direct')
    assert.equal(describeBusTransfers(1), '1 transfer')
    assert.equal(describeBusTransfers(2), '2 transfers')
    assert.equal(describeBusStops(1), '1 stop')
    assert.equal(formatBusClock('2026-10-12T08:05:00+05:30'), '08:05')
    assert.equal(formatBusClock(null), '')
    assert.equal(formatBusClock('nonsense'), '')
  })
})

describe('bus: no route messages', () => {
  it('says why in words, and falls back to the general message for anything unknown', () => {
    assert.match(describeBusNoRoute('NO_STOP_NEAR_START'), /near your start/)
    assert.match(describeBusNoRoute('NO_STOP_NEAR_DESTINATION'), /near your destination/)
    assert.match(describeBusNoRoute('NO_SERVICE'), /scheduled bus service/)
    assert.match(describeBusNoRoute('NO_BUS_DATA'), /not available right now/)
    assert.equal(describeBusNoRoute('NO_JOURNEY'), 'No bus route was found between these places.')
    assert.equal(describeBusNoRoute(null), 'No bus route was found between these places.')
  })

  it('accepts only the documented reason codes', () => {
    assert.equal(parseNoRouteReason('NO_SERVICE'), 'NO_SERVICE')
    assert.equal(parseNoRouteReason('SOMETHING_ELSE'), null)
    assert.equal(parseNoRouteReason(undefined), null)
  })
})

describe('bus stops layer response', () => {
  it('keeps valid stops, drops malformed ones and reports truncation', () => {
    const parsed = parseBusStopsInWindow({
      stops: [{ id: 's1', name: 'Stop 1', latitude: 28.6, longitude: 77.2 }, { id: '', name: 'x', latitude: 1, longitude: 1 }, { id: 's2', name: ' ', latitude: 1, longitude: 1 }, { id: 's3', name: 'Far', latitude: 95, longitude: 1 }, 'x'],
      truncated: true,
    })
    assert.deepEqual(parsed.stops.map((s) => s.key), ['s1'])
    assert.equal(parsed.stops[0]?.role, 'network')
    assert.equal(parsed.truncated, true)
    assert.throws(() => parseBusStopsInWindow({}))
  })
})
