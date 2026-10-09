import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyFailure, GoogleApiError, toGoogleApiError } from '../../../services/google/googleFailure.ts'
import { ApiError } from '../../../services/api/ApiError.ts'
import { parseTransit } from '../utils/parseTransit.ts'
import type { Route } from '../types/route.ts'
import { DEFAULT_TRAVEL_MODE, describeNoRoute, isTravelMode, LIMITED_COVERAGE_WARNING, TRAVEL_MODE_INFO, TRAVEL_MODES } from '../types/travelMode.ts'
import { describeTransfers, describeTransitPath, vehicleLabel } from '../utils/transitSummary.ts'
import { createRouteSession, locationKey, routeRequestKey } from './routeSession.ts'
import { NO_ROUTE_SESSION, routeSessionReducer } from './routeSessionReducer.ts'

const place = (name: string, lat: number) => ({ name, latitude: lat, longitude: 1 })
const route = (id: string): Route => ({
  id, index: 0, distanceMeters: 1, durationSeconds: 1, summary: '', encodedPolyline: 'x', path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], detectedAreas: [],
})
const S = place('S', 1)
const D = place('D', 2)

describe('travel mode definitions', () => {
  it('offers the seven modes, defaulting to the four wheeler', () => {
    assert.deepEqual([...TRAVEL_MODES], ['TWO_WHEELER', 'FOUR_WHEELER', 'WALKING', 'CYCLING', 'TRAIN', 'METRO', 'BUS'])
    assert.equal(DEFAULT_TRAVEL_MODE, 'FOUR_WHEELER')
    assert.ok(TRAVEL_MODES.every(isTravelMode))
    assert.equal(isTravelMode('BUS'), true)
    assert.equal(isTravelMode('FERRY'), false)
  })

  it('only Two Wheeler, Walking and Cycling carry the limited-coverage warning', () => {
    const warned = TRAVEL_MODES.filter((mode) => TRAVEL_MODE_INFO[mode].limitedCoverage)
    assert.deepEqual(warned, ['TWO_WHEELER', 'WALKING', 'CYCLING'])
    assert.equal(LIMITED_COVERAGE_WARNING, 'Routes for this travel mode may have limited path coverage.')
  })

  it('Train, Metro and Bus are transit modes; the rest are not', () => {
    assert.deepEqual(TRAVEL_MODES.filter((mode) => TRAVEL_MODE_INFO[mode].transit), ['TRAIN', 'METRO', 'BUS'])
  })

  it('names the missing service when a transit mode has no route', () => {
    assert.equal(describeNoRoute('METRO'), 'No metro route is available for this journey.')
    assert.equal(describeNoRoute('BUS'), 'No bus route was found between these places.')
    assert.match(describeNoRoute('BUS', 'NO_STOP_NEAR_START'), /near your start/)
    assert.equal(describeNoRoute('TRAIN'), 'No train route is available for this journey.')
    assert.equal(describeNoRoute('FOUR_WHEELER'), 'No route found between these locations.')
  })
})

describe('selected mode and session consistency', () => {
  it('the request key contains the mode, so every mode is its own request', () => {
    const keys = TRAVEL_MODES.map((mode) => routeRequestKey(S, D, mode))
    assert.equal(new Set(keys).size, TRAVEL_MODES.length)
    assert.equal(routeRequestKey(S, null, 'WALKING'), null)
    assert.ok(keys.every((key) => key !== null && key.startsWith(locationKey(S, D) ?? '?')))
  })

  it('a session records the mode it was calculated for (default: four wheeler)', () => {
    assert.equal(createRouteSession('a', S, D, [route('r')], 0).travelMode, 'FOUR_WHEELER')
    assert.equal(createRouteSession('b', S, D, [route('r')], 0, 'METRO').travelMode, 'METRO')
  })

  it('routes of one mode are never shown for another: the state is tied to its key', () => {
    const walking = routeRequestKey(S, D, 'WALKING') ?? ''
    const cycling = routeRequestKey(S, D, 'CYCLING') ?? ''
    const state = [
      { type: 'calculationStarted', key: walking },
      { type: 'calculationSucceeded', key: walking, session: createRouteSession('w', S, D, [route('r')], 0, 'WALKING') },
    ] as const
    const ready = state.reduce(routeSessionReducer, NO_ROUTE_SESSION)
    assert.equal(ready.status, 'ready')
    // The hook compares the stored key with the current one; after a mode change they differ, so nothing is shown.
    assert.equal(ready.status === 'ready' && ready.key === cycling, false)
    // The stale result is then discarded for good.
    assert.deepEqual(routeSessionReducer(ready, { type: 'sessionDiscarded', key: walking }), NO_ROUTE_SESSION)
  })

  it('a late answer for the previous mode cannot replace a pending calculation of the new one', () => {
    const driving = routeRequestKey(S, D, 'FOUR_WHEELER') ?? ''
    const metro = routeRequestKey(S, D, 'METRO') ?? ''
    const loading = routeSessionReducer(NO_ROUTE_SESSION, { type: 'calculationStarted', key: metro })
    const late = routeSessionReducer(loading, { type: 'calculationSucceeded', key: driving, session: createRouteSession('d', S, D, [route('r')], 0) })
    assert.deepEqual(late, loading)
  })
})

describe('bus mode and stale sessions', () => {
  it('a bus result is never shown after the mode changes, and a late bus answer cannot replace the new mode', () => {
    const bus = routeRequestKey(S, D, 'BUS') ?? ''
    const walking = routeRequestKey(S, D, 'WALKING') ?? ''
    assert.notEqual(bus, walking)
    const steps = [
      { type: 'calculationStarted', key: bus },
      { type: 'calculationSucceeded', key: bus, session: createRouteSession('b', S, D, [route('r')], 0, 'BUS') },
    ] as const
    const ready = steps.reduce(routeSessionReducer, NO_ROUTE_SESSION)
    assert.equal(ready.status === 'ready' && ready.key === bus, true)
    assert.equal(ready.status === 'ready' && ready.session.travelMode, 'BUS')
    assert.equal(ready.status === 'ready' && ready.key === walking, false)
    const loading = routeSessionReducer(NO_ROUTE_SESSION, { type: 'calculationStarted', key: walking })
    const late = routeSessionReducer(loading, { type: 'calculationSucceeded', key: bus, session: createRouteSession('b', S, D, [route('r')], 0, 'BUS') })
    assert.deepEqual(late, loading)
  })
})

describe('unsupported travel mode', () => {
  it('is classified from the backend code, not retried and explained in plain words', () => {
    const error = new ApiError(422, { code: 'ROUTING_UNSUPPORTED_MODE' })
    assert.equal(classifyFailure(error), 'unsupported-mode')
    const failure = toGoogleApiError(error, 'routeCalculation')
    assert.equal(failure.kind, 'unsupported-mode')
    assert.equal(failure.canTryAgain, false)
    assert.equal(failure.retryable, false)
    assert.equal(failure.message, "This travel mode isn't available for this journey. Please choose another one.")
    assert.ok(new GoogleApiError('unsupported-mode', 'routeCalculation') instanceof Error)
  })

  it('the error state remembers it so the selector can mark the mode unavailable', () => {
    const key = routeRequestKey(S, D, 'TWO_WHEELER') ?? ''
    const failed = [
      { type: 'calculationStarted', key },
      { type: 'calculationFailed', key, message: 'm', canTryAgain: false, unsupportedMode: true },
    ] as const
    const state = failed.reduce(routeSessionReducer, NO_ROUTE_SESSION)
    assert.equal(state.status === 'error' && state.unsupportedMode, true)
  })
})

describe('transit details', () => {
  const ride = (over: object) => ({ kind: 'RIDE', lineName: 'Violet Line', vehicleType: 'SUBWAY', departureStop: 'Station A', arrivalStop: 'Station B', stopCount: 5, ...over })

  it('parses rides and walks tolerantly and drops malformed steps', () => {
    const details = parseTransit({ transfers: 1, departureTime: '2026-10-08T05:00:00Z', arrivalTime: null, steps: [{ kind: 'WALK', distanceMeters: 200, durationSeconds: 120 }, ride({}), { kind: 'BOGUS' }, 'x'] })
    assert.ok(details)
    assert.equal(details.steps.length, 2)
    assert.equal(details.steps[0]?.kind, 'walk')
    assert.equal(details.steps[1]?.kind, 'ride')
    assert.equal(details.transfers, 1)
    assert.equal(details.arrivalTime, null)
  })

  it('returns nothing (never an invented value) when there are no usable steps', () => {
    assert.equal(parseTransit(undefined), undefined)
    assert.equal(parseTransit({ steps: [] }), undefined)
    assert.equal(parseTransit({ steps: [{ kind: 'X' }] }), undefined)
  })

  it('describes transfers, vehicles and the path from what the provider returned', () => {
    assert.equal(describeTransfers(0), 'Direct')
    assert.equal(describeTransfers(1), '1 transfer')
    assert.equal(describeTransfers(2), '2 transfers')
    assert.equal(vehicleLabel('SUBWAY'), 'Metro')
    assert.equal(vehicleLabel('HEAVY_RAIL'), 'Train')
    assert.equal(vehicleLabel('CABLE_THING'), 'Cable thing')
    const details = parseTransit({ transfers: 1, steps: [ride({}), ride({ lineName: 'Yellow Line', departureStop: 'Station B', arrivalStop: 'Station C' })] })
    assert.ok(details)
    assert.equal(describeTransitPath(details), 'Station A → Violet Line → Yellow Line → Station C')
  })
})
