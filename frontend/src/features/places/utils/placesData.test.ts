import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CURRENT_LOCATION } from '../types/places.ts'
import {
  EMPTY_PLACES,
  MAX_RECENT_JOURNEYS,
  MAX_SAVED_PLACES,
  RECENT_TTL_MS,
  STORAGE_KEY,
  addSavedPlace,
  clearRecentJourneys,
  parsePlaces,
  recordRecentJourney,
  removeRecentJourney,
  removeSavedPlace,
  serializePlaces,
  updateSavedPlace,
} from './placesData.ts'
import { loadPlaces, savePlaces, type PlacesBackend } from '../services/placesStorage.ts'
import { toJourneyRecord } from './journeyRecord.ts'
import { describeRecent, formatSearchTime } from './recentFormat.ts'

const NOW = 1_800_000_000_000
const must = <T,>(change: { ok: true; data: T } | { ok: false; error: string }): T => {
  assert.equal(change.ok, true, change.ok ? '' : change.error)
  return (change as { ok: true; data: T }).data
}

describe('saved places', () => {
  it('saves Home and Work once each; setting them again replaces the place', () => {
    let data = must(addSavedPlace(EMPTY_PLACES, { kind: 'HOME', placeId: 'ChIJ_home1' }, 'a', NOW))
    data = must(addSavedPlace(data, { kind: 'WORK', placeId: 'ChIJ_work1' }, 'b', NOW))
    data = must(addSavedPlace(data, { kind: 'HOME', placeId: 'ChIJ_home2' }, 'c', NOW + 1))
    assert.deepEqual(data.saved.map((p) => [p.kind, p.label, p.placeId, p.id]), [['HOME', 'Home', 'ChIJ_home2', 'a'], ['WORK', 'Work', 'ChIJ_work1', 'b']])
  })

  it('custom places need a clean, unique, non-reserved name', () => {
    const data = must(addSavedPlace(EMPTY_PLACES, { kind: 'CUSTOM', label: '  Gym  ', placeId: 'p1' }, 'a', NOW))
    assert.equal(data.saved[0]?.label, 'Gym')
    assert.deepEqual(addSavedPlace(data, { kind: 'CUSTOM', label: 'gym', placeId: 'p2' }, 'b', NOW), { ok: false, error: 'LABEL_TAKEN' })
    assert.deepEqual(addSavedPlace(data, { kind: 'CUSTOM', label: 'Home', placeId: 'p2' }, 'b', NOW), { ok: false, error: 'LABEL_TAKEN' })
    assert.deepEqual(addSavedPlace(data, { kind: 'CUSTOM', label: '   ', placeId: 'p2' }, 'b', NOW), { ok: false, error: 'INVALID_LABEL' })
    assert.deepEqual(addSavedPlace(data, { kind: 'CUSTOM', label: 'x'.repeat(41), placeId: 'p2' }, 'b', NOW), { ok: false, error: 'INVALID_LABEL' })
    assert.deepEqual(addSavedPlace(data, { kind: 'CUSTOM', label: 'Cafe', placeId: 'not a place id!' }, 'b', NOW), { ok: false, error: 'INVALID_PLACE' })
  })

  it('stops at the limit', () => {
    let data = EMPTY_PLACES
    for (let i = 0; i < MAX_SAVED_PLACES; i++) data = must(addSavedPlace(data, { kind: 'CUSTOM', label: `Place ${i}`, placeId: `p${i}` }, `id${i}`, NOW))
    assert.deepEqual(addSavedPlace(data, { kind: 'CUSTOM', label: 'One more', placeId: 'px' }, 'z', NOW), { ok: false, error: 'LIMIT' })
  })

  it('renames custom places only, and can point a place somewhere else', () => {
    let data = must(addSavedPlace(EMPTY_PLACES, { kind: 'CUSTOM', label: 'Gym', placeId: 'p1' }, 'a', NOW))
    data = must(addSavedPlace(data, { kind: 'HOME', placeId: 'h1' }, 'h', NOW))
    data = must(updateSavedPlace(data, 'a', { label: 'Pool' }, NOW))
    assert.equal(data.saved[0]?.label, 'Pool')
    assert.deepEqual(updateSavedPlace(data, 'h', { label: 'Flat' }, NOW), { ok: false, error: 'FIXED_LABEL' })
    assert.deepEqual(updateSavedPlace(data, 'a', { label: 'Work' }, NOW), { ok: false, error: 'LABEL_TAKEN' })
    assert.deepEqual(updateSavedPlace(data, 'nope', { label: 'X' }, NOW), { ok: false, error: 'NOT_FOUND' })
    data = must(updateSavedPlace(data, 'h', { placeId: 'h2' }, NOW))
    assert.equal(data.saved.find((p) => p.id === 'h')?.placeId, 'h2')
    assert.equal(removeSavedPlace(data, 'a').saved.some((p) => p.id === 'a'), false)
  })
})

describe('recent journeys', () => {
  const to = { placeId: 'dest1', label: 'Connaught Place' }
  const from = { placeId: 'src1', label: 'Saket' }

  it('repeating a search moves it to the top instead of adding a copy', () => {
    let data = recordRecentJourney(EMPTY_PLACES, { origin: from, destination: to, travelMode: 'METRO' }, 'a', NOW)
    data = recordRecentJourney(data, { origin: CURRENT_LOCATION, destination: to, travelMode: 'METRO' }, 'b', NOW + 10)
    data = recordRecentJourney(data, { origin: from, destination: to, travelMode: 'METRO' }, 'c', NOW + 20)
    assert.deepEqual(data.recent.map((j) => j.id), ['c', 'b'])
    // The mode is part of the journey.
    data = recordRecentJourney(data, { origin: from, destination: to, travelMode: 'BUS' }, 'd', NOW + 30)
    assert.equal(data.recent.length, 3)
  })

  it('keeps the newest ten and drops anything older than 30 days', () => {
    let data = EMPTY_PLACES
    for (let i = 0; i < 14; i++) data = recordRecentJourney(data, { origin: from, destination: { placeId: `d${i}`, label: `D${i}` }, travelMode: 'WALKING' }, `id${i}`, NOW + i)
    assert.equal(data.recent.length, MAX_RECENT_JOURNEYS)
    assert.equal(data.recent[0]?.id, 'id13')
    const later = recordRecentJourney(data, { origin: from, destination: { placeId: 'fresh', label: 'Fresh' }, travelMode: 'WALKING' }, 'f', NOW + RECENT_TTL_MS + 100)
    assert.deepEqual(later.recent.map((j) => j.id), ['f'])
  })

  it('stores a current-location start as CURRENT_LOCATION and never a coordinate', () => {
    const record = toJourneyRecord({ name: 'Current location', latitude: 28.61234, longitude: 77.20987, origin: 'CURRENT_LOCATION' }, { name: 'Connaught Place', latitude: 28.63, longitude: 77.21, placeId: 'dest1' }, 'BUS')
    assert.equal(record?.origin, CURRENT_LOCATION)
    const data = recordRecentJourney(EMPTY_PLACES, record!, 'a', NOW)
    const text = serializePlaces(data)
    assert.ok(text.includes('CURRENT_LOCATION'))
    for (const leaked of ['28.61', '77.20', '28.63', '77.21', 'latitude', 'longitude', 'lat', 'lng']) assert.equal(text.includes(leaked), false, leaked)
  })

  it('does not record a journey that cannot be looked up again', () => {
    assert.equal(toJourneyRecord({ name: 'Somewhere', latitude: 1, longitude: 1 }, { name: 'B', latitude: 2, longitude: 2, placeId: 'b' }, 'BUS'), null)
    assert.equal(toJourneyRecord({ name: 'A', latitude: 1, longitude: 1, placeId: 'a' }, { name: 'B', latitude: 2, longitude: 2 }, 'BUS'), null)
  })

  it('removes one record or clears them all, leaving saved places alone', () => {
    let data = must(addSavedPlace(EMPTY_PLACES, { kind: 'HOME', placeId: 'h' }, 'h', NOW))
    data = recordRecentJourney(data, { origin: from, destination: to, travelMode: 'METRO' }, 'a', NOW)
    data = recordRecentJourney(data, { origin: from, destination: to, travelMode: 'BUS' }, 'b', NOW + 1)
    assert.deepEqual(removeRecentJourney(data, 'a').recent.map((j) => j.id), ['b'])
    const cleared = clearRecentJourneys(data)
    assert.equal(cleared.recent.length, 0)
    assert.equal(cleared.saved.length, 1)
  })

  it('formats time and descriptions plainly', () => {
    assert.equal(formatSearchTime(NOW, NOW + 5_000), 'Just now')
    assert.equal(formatSearchTime(NOW, NOW + 12 * 60_000), '12 min ago')
    assert.equal(formatSearchTime(NOW, NOW + 3 * 3_600_000), '3 h ago')
    assert.equal(formatSearchTime(NOW, NOW + 30 * 3_600_000), 'Yesterday')
    assert.equal(formatSearchTime(NOW, NOW + 5 * 86_400_000), '5 days ago')
    const data = recordRecentJourney(EMPTY_PLACES, { origin: CURRENT_LOCATION, destination: to, travelMode: 'METRO' }, 'a', NOW)
    assert.equal(describeRecent(data.recent[0]!), 'Current location to Connaught Place, Metro')
  })
})

describe('reading stored data', () => {
  const doc = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ version: 1, saved: [{ id: 'a', kind: 'HOME', label: 'Home', placeId: 'h1', savedAt: NOW }], recent: [], ...extra })

  it('round-trips', () => {
    let data = must(addSavedPlace(EMPTY_PLACES, { kind: 'CUSTOM', label: 'Gym', placeId: 'p1' }, 'a', NOW))
    data = recordRecentJourney(data, { origin: CURRENT_LOCATION, destination: { placeId: 'd', label: 'D' }, travelMode: 'BUS' }, 'r', NOW)
    const back = parsePlaces(serializePlaces(data), NOW)
    assert.equal(back.status, 'ok')
    assert.deepEqual(back.data, data)
  })

  it('treats missing storage as empty and unreadable storage as discarded', () => {
    assert.equal(parsePlaces(null, NOW).status, 'empty')
    for (const bad of ['{not json', '"text"', '[]', 'null', '{}', JSON.stringify({ version: 2, saved: [], recent: [] }), JSON.stringify({ version: 1, saved: 'x', recent: [] }), JSON.stringify({ saved: [], recent: [] })]) {
      const outcome = parsePlaces(bad, NOW)
      assert.equal(outcome.status, 'discarded', bad)
      assert.deepEqual(outcome.data, EMPTY_PLACES)
    }
  })

  it('drops invalid records one by one and keeps the good ones', () => {
    const raw = JSON.stringify({
      version: 1,
      saved: [
        { id: 'a', kind: 'HOME', label: 'Ignored name', placeId: 'h1', savedAt: NOW },
        { id: 'b', kind: 'CUSTOM', label: '', placeId: 'p', savedAt: NOW },
        { id: 'c', kind: 'CUSTOM', label: 'Bad id', placeId: '<script>', savedAt: NOW },
        { id: 'd', kind: 'ROOF', label: 'Roof', placeId: 'p', savedAt: NOW },
        { id: 'e', kind: 'CUSTOM', label: 'Gym', placeId: 'p2', savedAt: 'yesterday' },
        { id: 'f', kind: 'CUSTOM', label: 'Cafe', placeId: 'p3', savedAt: NOW },
        42,
        null,
      ],
      recent: [
        { id: 'r1', origin: 'CURRENT_LOCATION', destination: { placeId: 'd', label: 'D' }, travelMode: 'BUS', searchedAt: NOW },
        { id: 'r2', origin: 'CURRENT_LOCATION', destination: { placeId: 'd', label: 'D' }, travelMode: 'HOVERCRAFT', searchedAt: NOW },
        { id: 'r3', origin: { lat: 1, lng: 2 }, destination: { placeId: 'd', label: 'D' }, travelMode: 'BUS', searchedAt: NOW },
        { id: 'r4', origin: 'CURRENT_LOCATION', destination: { placeId: 'd', label: 'D' }, travelMode: 'METRO', searchedAt: NOW - RECENT_TTL_MS - 1 },
        { id: 'r5', origin: 'CURRENT_LOCATION', destination: { placeId: 'd', label: 'D' }, travelMode: 'METRO', searchedAt: NOW * 3 },
      ],
    })
    const { data, status } = parsePlaces(raw, NOW)
    assert.equal(status, 'ok')
    assert.deepEqual(data.saved.map((p) => [p.id, p.label]), [['a', 'Home'], ['f', 'Cafe']])
    assert.deepEqual(data.recent.map((j) => j.id), ['r1'])
  })

  it('keeps one Home, one Work and unique names even if the stored text has more', () => {
    const raw = doc({ saved: [
      { id: 'a', kind: 'HOME', label: 'Home', placeId: 'h1', savedAt: NOW },
      { id: 'b', kind: 'HOME', label: 'Home', placeId: 'h2', savedAt: NOW },
      { id: 'c', kind: 'CUSTOM', label: 'Gym', placeId: 'p1', savedAt: NOW },
      { id: 'd', kind: 'CUSTOM', label: 'gym', placeId: 'p2', savedAt: NOW },
    ] })
    assert.deepEqual(parsePlaces(raw, NOW).data.saved.map((p) => p.id), ['a', 'c'])
  })

  it('strips control characters and caps label length from stored text', () => {
    const raw = doc({ saved: [{ id: 'a', kind: 'CUSTOM', label: 'Gy\u0000m\n', placeId: 'p1', savedAt: NOW }, { id: 'b', kind: 'CUSTOM', label: 'y'.repeat(100), placeId: 'p2', savedAt: NOW }] })
    assert.deepEqual(parsePlaces(raw, NOW).data.saved.map((p) => p.label), ['Gy m'])
  })
})

describe('storage backend', () => {
  function memory(initial: string | null = null): PlacesBackend & { value: string | null; removed: number } {
    return {
      value: initial,
      removed: 0,
      getItem() { return this.value },
      setItem(_key: string, value: string) { this.value = value },
      removeItem() { this.value = null; this.removed++ },
    }
  }

  it('writes under a versioned key and reads it back', () => {
    const backend = memory()
    const data = must(addSavedPlace(EMPTY_PLACES, { kind: 'HOME', placeId: 'h1' }, 'a', NOW))
    assert.equal(savePlaces(data, backend), true)
    assert.equal(JSON.parse(backend.value!).version, 1)
    assert.deepEqual(loadPlaces(NOW, backend), data)
    assert.equal(STORAGE_KEY, 'routeview.places')
  })

  it('removes corrupt data it cannot read, and removes the key when nothing is left', () => {
    const corrupt = memory('{{{')
    assert.deepEqual(loadPlaces(NOW, corrupt), EMPTY_PLACES)
    assert.equal(corrupt.value, null)
    const backend = memory('x')
    savePlaces(EMPTY_PLACES, backend)
    assert.equal(backend.value, null)
  })

  it('never throws when the browser blocks storage or is full', () => {
    const blocked: PlacesBackend = {
      getItem() { throw new Error('SecurityError') },
      setItem() { throw new Error('QuotaExceededError') },
      removeItem() { throw new Error('SecurityError') },
    }
    assert.deepEqual(loadPlaces(NOW, blocked), EMPTY_PLACES)
    assert.equal(savePlaces(must(addSavedPlace(EMPTY_PLACES, { kind: 'HOME', placeId: 'h' }, 'a', NOW)), blocked), false)
    assert.deepEqual(loadPlaces(NOW, null), EMPTY_PLACES)
    assert.equal(savePlaces(EMPTY_PLACES, null), false)
  })

  it('stores nothing but IDs, labels, kinds, modes and times', () => {
    let data = must(addSavedPlace(EMPTY_PLACES, { kind: 'CUSTOM', label: 'Gym', placeId: 'p1' }, 'a', NOW))
    data = recordRecentJourney(data, { origin: { placeId: 's', label: 'Saket' }, destination: { placeId: 'd', label: 'CP' }, travelMode: 'METRO' }, 'r', NOW)
    const keys = new Set<string>()
    JSON.parse(serializePlaces(data), function (key) { if (key !== '' && !/^\d+$/.test(key)) keys.add(key); return this[key] })
    assert.deepEqual([...keys].sort(), ['destination', 'id', 'kind', 'label', 'origin', 'placeId', 'recent', 'saved', 'savedAt', 'searchedAt', 'travelMode', 'version'])
  })
})
