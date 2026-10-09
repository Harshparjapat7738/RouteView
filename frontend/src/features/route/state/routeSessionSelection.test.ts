import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DetectedArea } from '../types/detectedArea.ts'
import type { Route } from '../types/route.ts'
import { createRouteSession, getSelectedArea, selectRouteAreaInSession } from './routeSession.ts'
import { NO_ROUTE_SESSION, routeSessionReducer } from './routeSessionReducer.ts'

const area = (id: string, name: string, sequence: number): DetectedArea => ({
  areaId: id, name, areaType: 'VILLAGE', sequence, positionAlongRoute: 0, distanceFromStartMeters: 0, location: { lat: 1, lng: 1 },
})
const route = (index: number, areas: DetectedArea[]): Route => ({
  id: `r${index}`, index, distanceMeters: 1, durationSeconds: 1, summary: '', encodedPolyline: 'x', path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], detectedAreas: areas,
})
const loc = { name: 'x', latitude: 1, longitude: 1 }
const base = () => createRouteSession('s', loc, { ...loc, latitude: 2 }, [route(0, [area('a', 'A', 1)]), route(1, [area('b', 'B', 1), area('c', 'C', 2)])], 0)

describe('choosing a search result (route + area)', () => {
  it('selects the route and highlights the area, keeping the routes untouched', () => {
    const s = base()
    const next = selectRouteAreaInSession(s, 'r1', 'c')
    assert.equal(next.selectedRouteId, 'r1')
    assert.equal(next.selectedAreaId, 'c')
    assert.equal(getSelectedArea(next)?.name, 'C')
    assert.equal(next.routes, s.routes)
  })

  it('is a no-op when route and area are already selected', () => {
    const once = selectRouteAreaInSession(base(), 'r1', 'c')
    assert.equal(selectRouteAreaInSession(once, 'r1', 'c'), once)
  })

  it('replaces an earlier highlight, and ignores unknown routes', () => {
    const s = selectRouteAreaInSession(base(), 'r1', 'b')
    assert.equal(selectRouteAreaInSession(s, 'r1', 'c').selectedAreaId, 'c')
    assert.equal(selectRouteAreaInSession(s, 'nope', 'c'), s)
  })

  it('an area that is not on that route selects the route but highlights nothing', () => {
    const next = selectRouteAreaInSession(base(), 'r1', 'a')
    assert.equal(next.selectedRouteId, 'r1')
    assert.equal(next.selectedAreaId, null)
  })

  it('works through the reducer and only in a ready state', () => {
    const ready = { status: 'ready' as const, key: 'k', session: base() }
    const next = routeSessionReducer(ready, { type: 'routeAreaSelected', routeId: 'r1', areaId: 'b' })
    assert.equal(next.status === 'ready' && next.session.selectedAreaId, 'b')
    assert.equal(routeSessionReducer(NO_ROUTE_SESSION, { type: 'routeAreaSelected', routeId: 'r1', areaId: 'b' }), NO_ROUTE_SESSION)
  })
})
