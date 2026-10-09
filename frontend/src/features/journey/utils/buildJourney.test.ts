import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRouteSession } from '../../route/state/routeSession.ts'
import type { AreaType, DetectedArea } from '../../route/types/detectedArea.ts'
import type { Route } from '../../route/types/route.ts'
import { describeRouteMatch } from '../../route/utils/describeRouteMatch.ts'
import { buildJourney } from './buildJourney.ts'

// Synthetic labels: these tests describe the journey rules, not real geography.
function area(id: string, name: string, sequence: number, position: number, lat = 1): DetectedArea {
  return { areaId: id, name, areaType: 'VILLAGE' as AreaType, sequence, positionAlongRoute: position, distanceFromStartMeters: sequence * 1000, location: { lat, lng: 1 } }
}
function route(index: number, areas: DetectedArea[]): Route {
  return { id: `r${index}`, index, distanceMeters: 1, durationSeconds: 1, summary: '', encodedPolyline: 'x', path: [], detectedAreas: areas }
}
const s = (routes: Route[]) =>
  createRouteSession('s', { name: 'Start Place', latitude: 1, longitude: 1 }, { name: 'End Place', latitude: 2, longitude: 2 }, routes, 0)

describe('buildJourney', () => {
  const r = route(1, [area('c', 'Charlie', 3, 0.6, 9), area('a', 'Zulu', 1, 0.1, 1), area('b', 'Alpha', 2, 0.3, 5)])
  const session = s([route(0, []), r])

  it('uses the session’s start and destination, not detected areas', () => {
    const j = buildJourney(session, r, new Set(), null)
    assert.equal(j.startName, 'Start Place')
    assert.equal(j.destinationName, 'End Place')
    assert.equal(j.routeNumber, 2)
    assert.equal(j.stops.some((stop) => stop.name === 'Start Place' || stop.name === 'End Place'), false)
  })

  it('keeps travel order (sequence), never alphabetical or by coordinates', () => {
    assert.deepEqual(buildJourney(session, r, new Set(), null).stops.map((x) => x.name), ['Zulu', 'Alpha', 'Charlie'])
  })

  it('breaks sequence ties by position along the route', () => {
    const tied = route(0, [area('y', 'Y', 1, 0.5), area('x', 'X', 1, 0.2)])
    assert.deepEqual(buildJourney(s([tied]), tied, new Set(), null).stops.map((x) => x.name), ['X', 'Y'])
  })

  it('marks matched stops by their own ids only, and the selected stop', () => {
    const j = buildJourney(session, r, new Set(['b']), 'c')
    assert.deepEqual(j.stops.map((x) => [x.name, x.matched, x.selected]), [['Zulu', false, false], ['Alpha', true, false], ['Charlie', false, true]])
    // An id from another route, or a similar name, never marks a stop.
    assert.equal(buildJourney(session, r, new Set(['alpha', 'other-route-id']), null).stops.some((x) => x.matched), false)
  })

  it('a route without detected areas has an empty, valid journey', () => {
    const j = buildJourney(session, session.routes[0]!, new Set(), null)
    assert.equal(j.stops.length, 0)
    assert.equal(j.routeNumber, 1)
  })

  it('does not change the route’s own data', () => {
    buildJourney(session, r, new Set(), null)
    assert.deepEqual(r.detectedAreas.map((x) => x.name), ['Charlie', 'Zulu', 'Alpha'])
  })

  it('clamps the position into 0..1', () => {
    const odd = route(0, [area('p', 'P', 1, 1.4)])
    assert.equal(buildJourney(s([odd]), odd, new Set(), null).stops[0]?.position, 1)
  })
})

describe('describeRouteMatch', () => {
  const a1 = area('a', 'Alpha', 1, 0)
  const a2 = area('b', 'Beta', 2, 0.5)
  it('full multi-area match', () => assert.equal(describeRouteMatch({ areas: [a1, a2], expected: 2, complete: true }), 'Matches all 2 selected areas'))
  it('partial match is never worded as a full one', () => assert.equal(describeRouteMatch({ areas: [a1], expected: 2, complete: false }), 'Matches 1 of 2 areas'))
  it('single area names it', () => assert.equal(describeRouteMatch({ areas: [a1], expected: 1, complete: true }), 'Matches Alpha'))
})
