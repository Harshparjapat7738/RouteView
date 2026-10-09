import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rawBusJourney } from './busFixture.ts'
import { JOURNEY_STOP_MIN_ZOOM, NETWORK_STOP_MIN_ZOOM, journeyBusParts, journeyBusStops, networkOnly, visibleJourneyStop } from './mapBus.ts'
import { parseBusJourney } from './parseBus.ts'

const journey = parseBusJourney(rawBusJourney())

describe('bus map data', () => {
  it('lists each stop of the journey once, with boarding, transfer and exit roles', () => {
    const stops = journeyBusStops(journey)
    assert.deepEqual(stops.map((s) => s.key), ['a', 'b', 'c', 'd', 'e'])
    assert.deepEqual(stops.map((s) => s.role), ['boarding', 'journey', 'transfer', 'journey', 'exit'])
  })

  it('a stop that is the exit of one ride and the boarding of the next is one transfer stop', () => {
    assert.equal(journeyBusStops(journey).filter((s) => s.key === 'c').length, 1)
    assert.equal(journeyBusStops(journey).find((s) => s.key === 'c')?.role, 'transfer')
  })

  it('draws rides and walks that have geometry, in order, and never a transfer', () => {
    const parts = journeyBusParts(journey)
    assert.deepEqual(parts.map((p) => p.kind), ['walk', 'bus', 'bus', 'walk'])
    assert.deepEqual(parts.filter((p) => p.kind === 'bus').map((p) => p.label), ['216DOWN', '171UP'])
    assert.ok(parts.every((p) => p.path.length >= 2))
  })

  it('draws nothing for a missing journey', () => {
    assert.deepEqual(journeyBusStops(undefined), [])
    assert.deepEqual(journeyBusParts(undefined), [])
  })

  it('shows the stops that matter at every zoom and the stops in between only when the map is close', () => {
    assert.equal(visibleJourneyStop({ role: 'boarding' }, 8, false), true)
    assert.equal(visibleJourneyStop({ role: 'exit' }, 8, false), true)
    assert.equal(visibleJourneyStop({ role: 'transfer' }, 8, false), true)
    assert.equal(visibleJourneyStop({ role: 'journey' }, JOURNEY_STOP_MIN_ZOOM - 1, false), false)
    assert.equal(visibleJourneyStop({ role: 'journey' }, JOURNEY_STOP_MIN_ZOOM, false), true)
    assert.equal(visibleJourneyStop({ role: 'journey' }, 8, true), true)
    assert.ok(NETWORK_STOP_MIN_ZOOM >= JOURNEY_STOP_MIN_ZOOM)
  })

  it('the layer does not draw a stop the journey already draws', () => {
    const layer = [
      { key: 'a', name: 'A', position: { lat: 1, lng: 1 }, role: 'network' as const },
      { key: 'z', name: 'Z', position: { lat: 1, lng: 1 }, role: 'network' as const },
    ]
    assert.deepEqual(networkOnly(layer, new Set(['a'])).map((s) => s.key), ['z'])
  })
})
