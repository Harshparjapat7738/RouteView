import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { parseBusJourney } from '../../bus/utils/parseBus.ts'
import { rawBusJourney } from '../../bus/utils/busFixture.ts'
import type { LocationSelection } from '../../location/types/location.ts'
import { DEFAULT_PREFERENCES, type TravelPreferences } from '../../preferences/types/preferences.ts'
import type { Route } from '../../route/types/route.ts'
import { loadOffline, saveOffline, clearOfflineStorage, type OfflineBackend } from '../services/offlineStorage.ts'
import { CURRENT_LOCATION_ORIGIN, type OfflineJourney } from '../types/offline.ts'
import { buildOfflineJourney } from './buildOffline.ts'
import { endpointLabel } from './endpointLabel.ts'
import { assessFreshness, datasetChanged } from './freshness.ts'
import {
  EMPTY_OFFLINE,
  OFFLINE_STORAGE_KEY,
  addOfflineJourney,
  findSaved,
  normalizeOffline,
  parseOffline,
  removeOfflineJourney,
  serializeOffline,
} from './offlineData.ts'
import { DEFAULT_OFFLINE_POLICY, MAX_OFFLINE_JOURNEYS, MAX_STORED_CHARS, OFFLINE_LABEL_TTL_MS, STALE_AFTER_MS, itineraryAllowed } from './offlinePolicy.ts'

const NOW = Date.parse('2026-10-12T04:00:00Z')
const DAY = 24 * 60 * 60 * 1000

const here: LocationSelection = { name: 'Rohini Sector 7', latitude: 28.7041, longitude: 77.1025, placeId: 'ChIJ_rohini' }
const there: LocationSelection = { name: 'Nehru Place', latitude: 28.5494, longitude: 77.2518, placeId: 'ChIJ_nehru' }
const device: LocationSelection = { name: 'Current location', latitude: 28.61234567, longitude: 77.20987654, origin: 'CURRENT_LOCATION' }

function busRoute(over: Record<string, unknown> = {}): Route {
  const bus = parseBusJourney(
    rawBusJourney({
      dataset: { source: 'DELHI_BUS', sourceVersion: 'v-2024', importedAt: '2026-09-01T10:00:00Z', servicePeriodStart: '2024-01-01', servicePeriodEnd: '2027-01-01' },
      ...over,
    }),
  )
  assert.ok(bus !== null)
  return { id: 'r1', index: 0, distanceMeters: 9000, durationSeconds: 3000, summary: '', encodedPolyline: 'SECRETPOLYLINE', path: [{ lat: 1, lng: 2 }], detectedAreas: [], bus }
}

function googleRoute(): Route {
  return {
    id: 'g1',
    index: 0,
    distanceMeters: 12345,
    durationSeconds: 2222,
    summary: 'via NH48',
    encodedPolyline: 'GOOGLEPOLYLINE123',
    path: [{ lat: 28.1, lng: 77.1 }],
    detectedAreas: [],
    transit: { steps: [{ kind: 'ride', lineName: 'Yellow Line', vehicleType: 'SUBWAY', departureStop: 'Rajiv Chowk', arrivalStop: 'Hauz Khas', departureTime: '2026-10-12T08:00:00Z', arrivalTime: null, headsign: 'Huda', stopCount: 5, distanceMeters: 1, durationSeconds: 1 }], transfers: 0, departureTime: null, arrivalTime: null },
  }
}

function build(over: Partial<Parameters<typeof buildOfflineJourney>[0]> = {}): OfflineJourney {
  const result = buildOfflineJourney({ start: here, destination: there, travelMode: 'BUS', route: busRoute(), preferences: DEFAULT_PREFERENCES, id: 'j1', now: NOW, ...over })
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  return (result as { ok: true; journey: OfflineJourney }).journey
}

class FakeStorage implements OfflineBackend {
  items = new Map<string, string>()
  failWith: unknown = null
  /** The next write is cut short, as if the tab was closed mid-write; later writes (the rollback) go through. */
  corruptNext = false
  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    if (this.failWith !== null) throw this.failWith
    const cut = this.corruptNext
    this.corruptNext = false
    this.items.set(key, cut ? value.slice(0, Math.floor(value.length / 2)) : value)
  }
  removeItem(key: string): void {
    this.items.delete(key)
  }
}

function quota(): Error {
  const error = new Error('full')
  error.name = 'QuotaExceededError'
  return error
}

describe('what a saved journey keeps', () => {
  it('keeps a Bus itinerary as stop names, routes and transfers with its dataset source and version', () => {
    const journey = build()
    assert.equal(journey.itinerary?.source, 'DELHI_BUS')
    assert.equal(journey.itinerary?.datasetVersion, 'v-2024')
    assert.equal(journey.itinerary?.servicePeriodEnd, '2027-01-01')
    assert.equal(journey.itinerary?.transfers, 1)
    assert.deepEqual(journey.itinerary?.steps.map((step) => step.type), ['WALK', 'BUS', 'TRANSFER', 'BUS', 'WALK'])
    const rides = journey.itinerary?.steps.filter((step) => step.type === 'BUS') ?? []
    assert.deepEqual(rides.map((ride) => (ride.type === 'BUS' ? ride.stops : [])), [['Stop A', 'Stop B', 'Stop C'], ['Stop C', 'Stop D', 'Stop E']])
    assert.equal(journey.intentReason, null)
    assert.equal(journey.savedAt, NOW)
  })

  it('keeps no coordinates, path, polyline, fare or accessibility claim in what is written', () => {
    const text = serializeOffline({ journeys: [build()] })
    for (const forbidden of ['SECRETPOLYLINE', 'latitude', 'longitude', '"lat"', '"lng"', 'path', 'polyline', 'geometry', '"fare"', 'accessib', '28.6', '77.2']) {
      assert.equal(text.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden)
    }
  })

  it('stores the scheduled clock times in Delhi time as the saved schedule', () => {
    const ride = build().itinerary?.steps.find((step) => step.type === 'BUS')
    assert.equal(ride?.type === 'BUS' ? ride.departure : null, '08:05')
    assert.equal(ride?.type === 'BUS' ? ride.arrival : null, '08:20')
  })

  it('a current-location start is stored as the word with no coordinates, and the walk from the device is left out', () => {
    const journey = build({ start: device })
    assert.equal(journey.origin, CURRENT_LOCATION_ORIGIN)
    assert.deepEqual(journey.itinerary?.steps.map((step) => step.type), ['BUS', 'TRANSFER', 'BUS', 'WALK'])
    const text = serializeOffline({ journeys: [journey] })
    assert.equal(text.includes('28.61234567'), false)
    assert.equal(text.includes('77.20987654'), false)
    assert.equal(endpointLabel(journey.origin), 'Current location')
  })

  it('keeps only intent for Google journeys: no route, polyline, directions, times or durations', () => {
    for (const mode of ['FOUR_WHEELER', 'WALKING', 'CYCLING', 'TWO_WHEELER', 'TRAIN', 'METRO'] as const) {
      const journey = build({ travelMode: mode, route: googleRoute() })
      assert.equal(journey.itinerary, null, mode)
      assert.equal(journey.intentReason, 'GOOGLE_CONTENT', mode)
      const text = serializeOffline({ journeys: [journey] })
      for (const forbidden of ['GOOGLEPOLYLINE123', 'Yellow Line', 'Rajiv Chowk', 'via NH48', '12345', '2222', 'SUBWAY', 'steps']) {
        assert.equal(text.includes(forbidden), false, `${mode}: ${forbidden}`)
      }
      assert.ok(text.includes('ChIJ_rohini') && text.includes('ChIJ_nehru'), 'Place IDs are kept')
    }
  })

  it('only Bus can keep an itinerary, and only while the data policy allows it', () => {
    assert.equal(itineraryAllowed('BUS'), true)
    for (const mode of ['FOUR_WHEELER', 'WALKING', 'CYCLING', 'TWO_WHEELER', 'TRAIN', 'METRO'] as const) assert.equal(itineraryAllowed(mode), false, mode)
    assert.equal(itineraryAllowed('BUS', { bus: { itinerary: false } }), false)
    const journey = build({ policy: { bus: { itinerary: false } } })
    assert.equal(journey.itinerary, null)
    assert.equal(journey.intentReason, 'DATA_TERMS')
    assert.equal(DEFAULT_OFFLINE_POLICY.bus.itinerary, true)
  })

  it('a bus journey without a usable ride falls back to intent only, saying so', () => {
    assert.equal(build({ route: { ...busRoute(), bus: undefined } }).intentReason, 'NO_ITINERARY')
    const noRide = busRoute()
    const stripped = { ...noRide, bus: { ...noRide.bus!, segments: noRide.bus!.segments.filter((segment) => segment.type !== 'BUS') } }
    assert.equal(build({ route: stripped }).intentReason, 'NO_ITINERARY')
  })

  it('refuses a place that has no Place ID, and a missing destination or start', () => {
    const noId: LocationSelection = { name: 'Somewhere', latitude: 1, longitude: 2 }
    assert.deepEqual(buildOfflineJourney({ start: noId, destination: there, travelMode: 'BUS', route: busRoute(), preferences: DEFAULT_PREFERENCES, id: 'x', now: NOW }), { ok: false, error: 'NO_PLACE_ID' })
    assert.deepEqual(buildOfflineJourney({ start: here, destination: noId, travelMode: 'BUS', route: busRoute(), preferences: DEFAULT_PREFERENCES, id: 'x', now: NOW }), { ok: false, error: 'NO_PLACE_ID' })
    assert.deepEqual(buildOfflineJourney({ start: here, destination: null, travelMode: 'BUS', route: busRoute(), preferences: DEFAULT_PREFERENCES, id: 'x', now: NOW }), { ok: false, error: 'NO_DESTINATION' })
  })

  it('keeps the preferences that were selected, including accessibility only when on', () => {
    const chosen: TravelPreferences = { prefer: { ...DEFAULT_PREFERENCES.prefer, lessWalking: true }, accessibility: { stepFree: true, avoidInaccessible: false }, avoid: ['TWO_WHEELER'] }
    const journey = build({ preferences: chosen })
    const back = parseOffline(serializeOffline({ journeys: [journey] }), NOW).data.journeys[0]
    assert.deepEqual(back?.preferences, chosen)
    const plain = parseOffline(serializeOffline({ journeys: [build()] }), NOW).data.journeys[0]
    assert.deepEqual(plain?.preferences, DEFAULT_PREFERENCES)
  })
})

describe('reading and writing the list', () => {
  it('round-trips exactly', () => {
    const data = { journeys: [build({ id: 'a' }), build({ id: 'b', travelMode: 'METRO', route: googleRoute(), start: device })] }
    const read = parseOffline(serializeOffline(data), NOW)
    assert.equal(read.status, 'ok')
    assert.deepEqual(read.data.journeys.map((j) => j.id).sort(), ['a', 'b'])
    assert.deepEqual(read.data.journeys.find((j) => j.id === 'a'), data.journeys[0])
  })

  it('saving the same places and mode again replaces the earlier copy', () => {
    const first = addOfflineJourney(EMPTY_OFFLINE, build({ id: 'a', now: NOW - DAY }), NOW)
    assert.equal(first.ok, true)
    const second = addOfflineJourney((first as { ok: true; data: typeof EMPTY_OFFLINE }).data, build({ id: 'b' }), NOW)
    assert.equal(second.ok, true)
    const journeys = (second as { ok: true; data: typeof EMPTY_OFFLINE }).data.journeys
    assert.deepEqual(journeys.map((j) => j.id), ['b'])
    assert.equal(findSaved({ journeys }, build())?.id, 'b')
  })

  it('stops at the limit without changing anything, but still lets one be replaced', () => {
    let data = EMPTY_OFFLINE
    for (let i = 0; i < MAX_OFFLINE_JOURNEYS; i++) {
      const change = addOfflineJourney(data, build({ id: `j${i}`, destination: { ...there, placeId: `ChIJ_${i}` } }), NOW)
      assert.equal(change.ok, true)
      data = (change as { ok: true; data: typeof EMPTY_OFFLINE }).data
    }
    assert.deepEqual(addOfflineJourney(data, build({ id: 'extra', destination: { ...there, placeId: 'ChIJ_extra' } }), NOW), { ok: false, error: 'LIMIT' })
    assert.equal(addOfflineJourney(data, build({ id: 'again', destination: { ...there, placeId: 'ChIJ_3' } }), NOW).ok, true)
  })

  it('refuses a journey that would make the stored text too large', () => {
    const big = build()
    const huge: OfflineJourney = {
      ...big,
      itinerary: { ...big.itinerary!, steps: Array.from({ length: 20 }, () => ({ type: 'BUS' as const, route: 'R', agency: null, headsign: null, departure: null, arrival: null, stops: Array.from({ length: 200 }, (_, i) => `A stop with a rather long name number ${i} ${'x'.repeat(90)}`) })) },
    }
    assert.ok(serializeOffline({ journeys: [huge] }).length > MAX_STORED_CHARS)
    assert.deepEqual(addOfflineJourney(EMPTY_OFFLINE, huge, NOW), { ok: false, error: 'TOO_LARGE' })
  })

  it('removes one journey and reports one that is already gone', () => {
    const data = { journeys: [build({ id: 'a' })] }
    assert.deepEqual(removeOfflineJourney(data, 'a'), { ok: true, data: { journeys: [] } })
    assert.deepEqual(removeOfflineJourney(data, 'zzz'), { ok: false, error: 'NOT_FOUND' })
  })

  it('drops the Google place names after 30 days but keeps the Place IDs and the transit itinerary', () => {
    const old = build({ id: 'old', now: NOW - OFFLINE_LABEL_TTL_MS - DAY })
    const kept = normalizeOffline({ journeys: [old] }, NOW).journeys[0]
    assert.equal(kept?.destination.label, null)
    assert.equal(kept?.destination.placeId, 'ChIJ_nehru')
    assert.equal(endpointLabel(kept!.destination), 'Saved place')
    assert.ok(kept?.itinerary !== null)
    const fresh = normalizeOffline({ journeys: [build({ now: NOW - 5 * DAY })] }, NOW).journeys[0]
    assert.equal(fresh?.destination.label, 'Nehru Place')
  })
})

describe('corrupt or foreign stored data', () => {
  it('discards text that is not JSON, a truncated write, or another version', () => {
    for (const raw of ['not json', serializeOffline({ journeys: [build()] }).slice(0, 80), JSON.stringify({ version: 99, journeys: [] }), JSON.stringify({ version: 1 }), '[]', '"x"']) {
      assert.equal(parseOffline(raw, NOW).status, 'discarded', raw.slice(0, 20))
    }
    assert.equal(parseOffline(null, NOW).status, 'empty')
  })

  it('drops one unreadable record without losing the others', () => {
    const good = JSON.parse(serializeOffline({ journeys: [build({ id: 'good' })] })).journeys[0]
    const raw = JSON.stringify({ version: 1, journeys: [good, { id: 'bad' }, null, 5, { ...good, id: 'badmode', travelMode: 'ROCKET' }, { ...good, id: 'badplace', destination: { placeId: 'has spaces!', label: 'x' } }] })
    const read = parseOffline(raw, NOW)
    assert.deepEqual(read.data.journeys.map((j) => j.id), ['good'])
    assert.equal(read.dropped, 5)
  })

  it('an itinerary with one unreadable step is dropped whole and the journey keeps its intent', () => {
    const journey = JSON.parse(serializeOffline({ journeys: [build({ id: 'x' })] })).journeys[0]
    journey.itinerary.steps[1].stops = ['Only one stop']
    const read = parseOffline(JSON.stringify({ version: 1, journeys: [journey] }), NOW).data.journeys[0]
    assert.equal(read?.itinerary, null)
    assert.equal(read?.intentReason, 'NO_ITINERARY')
    assert.equal(read?.destination.placeId, 'ChIJ_nehru')
  })

  it('ignores impossible times and odd values without throwing', () => {
    const journey = JSON.parse(serializeOffline({ journeys: [build()] })).journeys[0]
    assert.equal(parseOffline(JSON.stringify({ version: 1, journeys: [{ ...journey, savedAt: NOW + 10 * DAY }] }), NOW).data.journeys.length, 0)
    assert.equal(parseOffline(JSON.stringify({ version: 1, journeys: [{ ...journey, savedAt: 'yesterday' }] }), NOW).data.journeys.length, 0)
    const odd = JSON.parse(JSON.stringify(journey))
    odd.itinerary.servicePeriodEnd = 'tomorrow'
    odd.itinerary.datasetImportedAt = 12
    const read = parseOffline(JSON.stringify({ version: 1, journeys: [odd] }), NOW).data.journeys[0]
    assert.equal(read?.itinerary?.servicePeriodEnd, null)
    assert.equal(read?.itinerary?.datasetImportedAt, null)
  })

  it('removes corrupt stored data when loading, and never throws on a storage that does', () => {
    const storage = new FakeStorage()
    storage.items.set(OFFLINE_STORAGE_KEY, '{"version":1,"journeys":[{"id"')
    const result = loadOffline(NOW, storage)
    assert.equal(result.discarded, true)
    assert.equal(result.data.journeys.length, 0)
    assert.equal(storage.items.has(OFFLINE_STORAGE_KEY), false)
    const throwing: OfflineBackend = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    assert.equal(loadOffline(NOW, throwing).data.journeys.length, 0)
    assert.equal(loadOffline(NOW, null).data.journeys.length, 0)
  })
})

describe('storage failures', () => {
  it('writes and reads back', () => {
    const storage = new FakeStorage()
    assert.deepEqual(saveOffline({ journeys: [build()] }, storage), { ok: true })
    assert.equal(loadOffline(NOW, storage).data.journeys.length, 1)
  })

  it('a full device is reported and the earlier list is left untouched', () => {
    const storage = new FakeStorage()
    saveOffline({ journeys: [build({ id: 'kept' })] }, storage)
    const before = storage.items.get(OFFLINE_STORAGE_KEY)
    storage.failWith = quota()
    assert.deepEqual(saveOffline({ journeys: [build({ id: 'kept' }), build({ id: 'new', destination: { ...there, placeId: 'ChIJ_other' } })] }, storage), { ok: false, reason: 'FULL' })
    storage.failWith = null
    assert.equal(storage.items.get(OFFLINE_STORAGE_KEY), before)
    assert.deepEqual(loadOffline(NOW, storage).data.journeys.map((j) => j.id), ['kept'])
  })

  it('an interrupted or altered write is detected by the read-back and rolled back', () => {
    const storage = new FakeStorage()
    saveOffline({ journeys: [build({ id: 'kept' })] }, storage)
    const before = storage.items.get(OFFLINE_STORAGE_KEY)
    storage.corruptNext = true
    assert.deepEqual(saveOffline({ journeys: [build({ id: 'new' })] }, storage), { ok: false, reason: 'FAILED' })
    assert.equal(storage.items.get(OFFLINE_STORAGE_KEY), before)
  })

  it('blocked storage means nothing is saved and the person is told', () => {
    assert.deepEqual(saveOffline({ journeys: [build()] }, null), { ok: false, reason: 'UNAVAILABLE' })
    const blocked: OfflineBackend = { getItem: () => { throw new Error('SecurityError') }, setItem: () => {}, removeItem: () => {} }
    assert.deepEqual(saveOffline({ journeys: [build()] }, blocked), { ok: false, reason: 'UNAVAILABLE' })
  })

  it('other write errors are a plain failure, not a full device', () => {
    const storage = new FakeStorage()
    storage.failWith = new Error('boom')
    assert.deepEqual(saveOffline({ journeys: [build()] }, storage), { ok: false, reason: 'FAILED' })
  })

  it('clearing removes the key completely, and clearing an empty store is fine', () => {
    const storage = new FakeStorage()
    saveOffline({ journeys: [build(), build({ id: 'b', destination: { ...there, placeId: 'ChIJ_b' } })] }, storage)
    assert.deepEqual(clearOfflineStorage(storage), { ok: true })
    assert.equal(storage.items.has(OFFLINE_STORAGE_KEY), false)
    assert.deepEqual(clearOfflineStorage(storage), { ok: true })
  })

  it('removing the last journey leaves no key behind', () => {
    const storage = new FakeStorage()
    saveOffline({ journeys: [build()] }, storage)
    saveOffline({ journeys: [] }, storage)
    assert.equal(storage.items.size, 0)
  })
})

describe('freshness and stale indicators', () => {
  const key = (over: Partial<NonNullable<OfflineJourney['itinerary']>>) => {
    const journey = build()
    return { ...journey, itinerary: { ...journey.itinerary!, ...over } }
  }

  it('a copy saved today with a current dataset has nothing to warn about', () => {
    const f = assessFreshness(build(), NOW + 60_000)
    assert.deepEqual(f.warnings, [])
    assert.equal(f.savedStale, false)
    assert.equal(f.savedAgo, 'Saved 1 min ago')
  })

  it('a copy older than a week says it may be out of date', () => {
    const f = assessFreshness(build(), NOW + STALE_AFTER_MS + DAY)
    assert.equal(f.savedStale, true)
    assert.match(f.warnings.join(' '), /saved 8 days ago/)
  })

  it('a timetable whose calendar has ended is called out first', () => {
    const f = assessFreshness(key({ servicePeriodEnd: '2026-10-01' }), NOW)
    assert.equal(f.serviceEnded, true)
    assert.match(f.warnings[0] ?? '', /only until 2026-10-01/)
    assert.equal(assessFreshness(key({ servicePeriodEnd: '2026-10-12' }), NOW).serviceEnded, false)
  })

  it('a dataset imported more than six months ago is old; an unknown import time is reported, not guessed', () => {
    assert.equal(assessFreshness(key({ datasetImportedAt: '2026-01-01T00:00:00Z' }), NOW).datasetOld, true)
    assert.equal(assessFreshness(key({ datasetImportedAt: '2026-10-01T00:00:00Z' }), NOW).datasetOld, false)
    const unknown = assessFreshness(key({ datasetImportedAt: null }), NOW)
    assert.equal(unknown.datasetAgeUnknown, true)
    assert.equal(unknown.datasetOld, false)
  })

  it('an intent-only journey has no dataset warnings', () => {
    const f = assessFreshness(build({ travelMode: 'METRO', route: googleRoute() }), NOW)
    assert.equal(f.datasetOld || f.serviceEnded || f.datasetAgeUnknown, false)
  })

  it('compares the saved dataset with a freshly calculated one', () => {
    const saved = build()
    assert.equal(datasetChanged(saved, 'v-2024'), false)
    assert.equal(datasetChanged(saved, 'v-2025'), true)
    assert.equal(datasetChanged(saved, null), null)
    assert.equal(datasetChanged(build({ travelMode: 'METRO', route: googleRoute() }), 'v-2025'), null)
  })
})

describe('the service worker never stores routing or Google content', () => {
  const config = readFileSync(new URL('../../../../vite.config.ts', import.meta.url), 'utf8')
  const code = config.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('has no runtime caching and no Google or API route handlers', () => {
    assert.equal(/runtimeCaching/.test(code), false)
    assert.equal(/googleapis|gstatic|maps\.google/i.test(code), false)
  })

  it('keeps API paths out of the navigation fallback', () => {
    assert.match(code, /navigateFallbackDenylist:\s*\[\/\^\\\/api\\\//)
  })
})
