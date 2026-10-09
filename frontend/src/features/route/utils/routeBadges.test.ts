import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Route } from '../types/route.ts'
import { computeRouteBadges } from './routeBadges.ts'

const route = (id: string, distanceMeters: number, durationSeconds: number): Route => ({
  id, index: 0, distanceMeters, durationSeconds, summary: '', encodedPolyline: 'x', path: [], detectedAreas: [],
})

describe('route badges', () => {
  it('marks the fastest and the shortest route independently', () => {
    const badges = computeRouteBadges([route('a', 32_400, 2_880), route('b', 35_100, 2_700), route('c', 30_000, 3_300)])
    assert.deepEqual(badges.get('a'), { fastest: false, shortest: false })
    assert.deepEqual(badges.get('b'), { fastest: true, shortest: false })
    assert.deepEqual(badges.get('c'), { fastest: false, shortest: true })
  })

  it('one route can be both', () => {
    const badges = computeRouteBadges([route('a', 10, 10), route('b', 20, 20)])
    assert.deepEqual(badges.get('a'), { fastest: true, shortest: true })
    assert.deepEqual(badges.get('b'), { fastest: false, shortest: false })
  })

  it('gives tied routes the badge', () => {
    const badges = computeRouteBadges([route('a', 10, 100), route('b', 10, 100), route('c', 20, 200)])
    assert.equal(badges.get('a')?.fastest, true)
    assert.equal(badges.get('b')?.fastest, true)
    assert.equal(badges.get('c')?.shortest, false)
  })

  it('gives no badge when there is nothing to compare', () => {
    assert.deepEqual(computeRouteBadges([route('a', 10, 10)]).get('a'), { fastest: false, shortest: false })
    const equal = computeRouteBadges([route('a', 10, 10), route('b', 10, 10)])
    assert.deepEqual(equal.get('a'), { fastest: false, shortest: false })
    // Only the value that differs earns a badge.
    const sameTime = computeRouteBadges([route('a', 10, 10), route('b', 20, 10)])
    assert.deepEqual(sameTime.get('a'), { fastest: false, shortest: true })
    assert.deepEqual(sameTime.get('b'), { fastest: false, shortest: false })
    assert.equal(computeRouteBadges([]).size, 0)
  })

  it('does not reorder or change the routes', () => {
    const routes = [route('z', 3, 3), route('a', 1, 1)]
    const copy = [...routes]
    computeRouteBadges(routes)
    assert.deepEqual(routes, copy)
  })
})
