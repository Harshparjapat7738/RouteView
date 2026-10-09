import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rawBusJourney } from '../../bus/utils/busFixture.ts'
import { parseBusJourney } from '../../bus/utils/parseBus.ts'
import type { Route } from '../types/route.ts'
import { computeRouteBadges } from './routeBadges.ts'

const route = (id: string, duration: number, transfers: number, walking: number): Route => ({
  id, index: 0, distanceMeters: 1000, durationSeconds: duration, summary: '', encodedPolyline: 'x', path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], detectedAreas: [],
  bus: parseBusJourney(rawBusJourney({ transfers, walkingSeconds: walking })),
})

describe('bus route badges', () => {
  it('compares time, transfers and walking, and never badges a fare or a distance', () => {
    const badges = computeRouteBadges([route('a', 2000, 1, 300), route('b', 2600, 0, 500)])
    assert.deepEqual(badges.get('a'), { fastest: true, shortest: false, fewestTransfers: false, leastWalking: true })
    assert.deepEqual(badges.get('b'), { fastest: false, shortest: false, fewestTransfers: true, leastWalking: false })
  })

  it('gives no badge when the routes are equal on a measure', () => {
    const badges = computeRouteBadges([route('a', 2000, 1, 300), route('b', 2000, 1, 300)])
    assert.deepEqual(badges.get('a'), { fastest: false, shortest: false, fewestTransfers: false, leastWalking: false })
  })
})
