import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { distanceToRouteMeters, prioritizeRoutesByCoverage, routePassesNearPoint } from './routePointProximity.ts'

describe('route point proximity', () => {
  it('measures distance to the closest point on a route segment', () => {
    const distance = distanceToRouteMeters(
      [
        { lat: 28.6, lng: 77.1 },
        { lat: 28.6, lng: 77.12 },
      ],
      { lat: 28.604, lng: 77.11 },
    )

    assert.ok(distance !== null)
    assert.ok(distance > 440 && distance < 450)
  })

  it('checks the inclusive radius and rejects routes beyond it', () => {
    const route = { path: [{ lat: 28.6, lng: 77.1 }, { lat: 28.6, lng: 77.12 }] }
    assert.equal(routePassesNearPoint(route, { lat: 28.604, lng: 77.11 }), true)
    assert.equal(routePassesNearPoint(route, { lat: 28.606, lng: 77.11 }), false)
  })

  it('handles a single-point path and missing geometry', () => {
    assert.equal(distanceToRouteMeters([{ lat: 0, lng: 0 }], { lat: 0, lng: 0 }), 0)
    assert.equal(distanceToRouteMeters([], { lat: 0, lng: 0 }), null)
    assert.equal(routePassesNearPoint({ path: [] }, { lat: 0, lng: 0 }), false)
  })

  it('handles repeated vertices without producing an invalid distance', () => {
    assert.equal(distanceToRouteMeters([{ lat: 28.6, lng: 77.1 }, { lat: 28.6, lng: 77.1 }], { lat: 28.6, lng: 77.1 }), 0)
  })

  it('prioritizes matching alternatives without changing their tie order', () => {
    const routes = [
      { id: 'first', index: 0 },
      { id: 'second', index: 1 },
      { id: 'third', index: 2 },
    ] as const
    assert.deepEqual(prioritizeRoutesByCoverage(routes, new Set(['third', 'second'])).map((route) => route.id), ['second', 'third', 'first'])
  })
})
