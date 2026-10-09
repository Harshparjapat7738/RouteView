import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Route } from '../types/route.ts'
import { journey } from '../../metro/utils/metroFixture.ts'
import { computeRouteBadges } from './routeBadges.ts'

const route = (id: string, durationSeconds: number, metro: ReturnType<typeof journey>): Route => ({
  id, index: 0, distanceMeters: 1000, durationSeconds, summary: '', encodedPolyline: 'x', path: [], detectedAreas: [], metro,
})

describe('metro comparison badges', () => {
  it('rates only measured values, with no score', () => {
    const a = route('a', 3000, journey({ transfers: 1, walkingSeconds: 600, fare: { currency: 'INR', amount: '40' } }))
    const b = route('b', 3400, journey({ transfers: 0, walkingSeconds: 900, fare: { currency: 'INR', amount: '30' } }))
    const badges = computeRouteBadges([a, b])
    assert.deepEqual([badges.get('a')?.fastest, badges.get('a')?.lowestFare, badges.get('a')?.fewestTransfers, badges.get('a')?.leastWalking], [true, false, false, true])
    assert.deepEqual([badges.get('b')?.fastest, badges.get('b')?.lowestFare, badges.get('b')?.fewestTransfers, badges.get('b')?.leastWalking], [false, true, true, false])
    assert.equal(badges.get('a')?.shortest, false)
  })

  it('gives no fare badge unless every route has a fare in the same currency', () => {
    const a = route('a', 3000, journey({ fare: { currency: 'INR', amount: '40' } }))
    const b = route('b', 3400, journey({ fare: null }))
    assert.equal(computeRouteBadges([a, b]).get('a')?.lowestFare, false)
    const c = route('c', 3400, journey({ fare: { currency: 'USD', amount: '1' } }))
    assert.equal(computeRouteBadges([a, c]).get('c')?.lowestFare, false)
  })

  it('gives no badge when routes are equal on a measure', () => {
    const a = route('a', 3000, journey())
    const b = route('b', 3000, journey())
    const badges = computeRouteBadges([a, b])
    assert.deepEqual([badges.get('a')?.fastest, badges.get('a')?.fewestTransfers, badges.get('a')?.leastWalking], [false, false, false])
  })
})
