import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildJourney } from '../../journey/utils/buildJourney.ts'
import { addSelectedArea, areaKey, matchRoutesByAreas, pruneSelectedAreas, searchAreas } from '../../search/services/passingAreaSearchService.ts'
import type { SelectedArea } from '../../search/types/areaSearch.ts'
import type { DetectedArea } from '../types/detectedArea.ts'
import type { Route } from '../types/route.ts'
import type { RouteSession } from '../types/routeSession.ts'
import { createRouteRequestSlot } from './routeRequestSlot.ts'
import { createRouteSession, getSelectedArea, getSelectedRoute, normalizeRouteSession } from './routeSession.ts'
import { NO_ROUTE_SESSION, routeSessionReducer, type RouteSessionAction, type RouteSessionState } from './routeSessionReducer.ts'

const area = (id: string, name: string, sequence: number): DetectedArea => ({
  areaId: id, name, areaType: 'VILLAGE', sequence, positionAlongRoute: sequence / 10, distanceFromStartMeters: sequence * 100, location: { lat: 1, lng: 1 },
})
const route = (id: string, index: number, areas: DetectedArea[]): Route => ({
  id, index, distanceMeters: 1, durationSeconds: 1, summary: '', encodedPolyline: 'x', path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], detectedAreas: areas,
})
const place = (name: string, lat: number) => ({ name, latitude: lat, longitude: 1 })
const sessionA = () =>
  createRouteSession('A', place('S', 1), place('D', 2), [route('a1', 0, [area('x1', 'Neharpar', 1), area('x2', 'Sector 88', 2)]), route('a2', 1, [area('y1', 'Neharpar', 1)])], 0)
const sessionB = () => createRouteSession('B', place('S', 3), place('D2', 4), [route('b1', 0, [area('z1', 'Tigaon', 1)])], 0)
const run = (state: RouteSessionState, ...actions: RouteSessionAction[]) => actions.reduce(routeSessionReducer, state)
const ready = (key: string, session: RouteSession): RouteSessionState => run(NO_ROUTE_SESSION, { type: 'calculationStarted', key }, { type: 'calculationSucceeded', key, session })

describe('Route Session lifecycle', () => {
  it('a new calculation replaces the old session completely, with a valid default selection', () => {
    const first = ready('K1', sessionA())
    const next = run(first, { type: 'calculationStarted', key: 'K2' }, { type: 'calculationSucceeded', key: 'K2', session: sessionB() })
    assert.equal(next.status, 'ready')
    if (next.status !== 'ready') return
    assert.equal(next.session.id, 'B')
    assert.equal(next.session.selectedRouteId, 'b1')
    assert.equal(next.session.selectedAreaId, null)
    assert.ok(getSelectedRoute(next.session))
  })

  it('while a new calculation runs the old session is not exposed as its result', () => {
    const loading = run(ready('K1', sessionA()), { type: 'calculationStarted', key: 'K2' })
    assert.deepEqual(loading, { status: 'loading', key: 'K2' })
  })

  it('a stale response cannot overwrite a newer calculation', () => {
    const state = run(NO_ROUTE_SESSION, { type: 'calculationStarted', key: 'K1' }, { type: 'calculationStarted', key: 'K2' })
    const afterStale = run(state, { type: 'calculationSucceeded', key: 'K1', session: sessionA() })
    assert.deepEqual(afterStale, state)
    const afterStaleFailure = run(state, { type: 'calculationFailed', key: 'K1', message: 'x', canTryAgain: true })
    assert.deepEqual(afterStaleFailure, state)
    const done = run(state, { type: 'calculationSucceeded', key: 'K2', session: sessionB() }, { type: 'calculationSucceeded', key: 'K1', session: sessionA() })
    assert.equal(done.status === 'ready' && done.session.id, 'B')
  })

  it('the request slot lets only the latest of two overlapping requests update the session', () => {
    const slot = createRouteRequestSlot()
    const a = slot.begin('K1')!
    const b = slot.begin('K2')!
    assert.equal(a.controller.signal.aborted, true)
    assert.equal(slot.isCurrent(a), false)
    assert.equal(slot.isCurrent(b), true)
  })

  it('a failed calculation shows an error for the new locations and never the old routes', () => {
    const failed = run(ready('K1', sessionA()), { type: 'calculationStarted', key: 'K2' }, { type: 'calculationFailed', key: 'K2', message: 'Could not calculate routes.', canTryAgain: true })
    assert.equal(failed.status, 'error')
    assert.equal(failed.status === 'error' && failed.key, 'K2')
    assert.ok(!('session' in failed))
  })

  it('discarding the session of the old locations leaves nothing that could be revived, and ignores other keys', () => {
    const state = ready('K1', sessionA())
    assert.deepEqual(run(state, { type: 'sessionDiscarded', key: 'K1' }), NO_ROUTE_SESSION)
    assert.equal(run(state, { type: 'sessionDiscarded', key: 'OTHER' }), state)
    assert.deepEqual(run(run(NO_ROUTE_SESSION, { type: 'calculationStarted', key: 'K1' }), { type: 'sessionDiscarded', key: 'K1' }), NO_ROUTE_SESSION)
  })

  it('a session with no routes is ready with no selection (empty state, not an error)', () => {
    const empty = ready('K1', createRouteSession('E', place('S', 1), place('D', 2), [], 0))
    assert.equal(empty.status === 'ready' && empty.session.selectedRouteId, null)
  })
})

describe('selected route and area always belong to the session', () => {
  it('an unknown or missing selected route id is replaced by a route of the session', () => {
    const broken: RouteSession = { ...sessionA(), selectedRouteId: 'route-from-session-B', selectedAreaId: 'z1' }
    const fixed = normalizeRouteSession(broken)
    assert.equal(fixed.selectedRouteId, 'a1')
    assert.equal(fixed.selectedAreaId, null)
    assert.equal(ready('K', broken).status === 'ready' && (ready('K', broken) as { session: RouteSession }).session.selectedRouteId, 'a1')
  })

  it('an area that is not on the selected route is cleared; a valid state is returned unchanged', () => {
    const valid = sessionA()
    assert.equal(normalizeRouteSession(valid), valid)
    assert.equal(normalizeRouteSession({ ...valid, selectedAreaId: 'y1' }).selectedAreaId, null)
    assert.equal(normalizeRouteSession({ ...valid, selectedAreaId: 'x2' }).selectedAreaId, 'x2')
  })

  it('no routes means no selected route', () => {
    const none = normalizeRouteSession({ ...sessionA(), routes: [], selectedRouteId: 'a1', selectedAreaId: 'x1' })
    assert.equal(none.selectedRouteId, null)
    assert.equal(none.selectedAreaId, null)
  })
})

describe('switching routes and synchronised views (no recalculation)', () => {
  it('switching routes only changes the selection: the same routes, the same session, journey and highlight follow', () => {
    const state = ready('K1', sessionA())
    if (state.status !== 'ready') throw new Error('not ready')
    const highlighted = run(state, { type: 'areaSelected', areaId: 'x2' })
    assert.equal(highlighted.status === 'ready' && getSelectedArea(highlighted.session)?.name, 'Sector 88')
    const switched = run(highlighted, { type: 'routeSelected', routeId: 'a2' })
    if (switched.status !== 'ready') throw new Error('not ready')
    assert.equal(switched.session.routes, state.session.routes)
    assert.equal(switched.session.id, 'A')
    assert.equal(switched.session.selectedAreaId, null)
    const journey = buildJourney(switched.session, getSelectedRoute(switched.session)!, new Set(), switched.session.selectedAreaId)
    assert.equal(journey.routeId, 'a2')
    assert.deepEqual(journey.stops.map((stop) => stop.areaId), ['y1'])
    const back = run(switched, { type: 'routeSelected', routeId: 'a1' })
    assert.equal(back.status === 'ready' && buildJourney(back.session, getSelectedRoute(back.session)!, new Set(), null).stops.length, 2)
  })

  it('selecting an unknown route is ignored', () => {
    const state = ready('K1', sessionA())
    assert.equal(run(state, { type: 'routeSelected', routeId: 'b1' }), state)
  })
})

describe('passing-area selections belong to the current session', () => {
  const chosen = (session: RouteSession, name: string): SelectedArea => {
    const outcome = searchAreas(session, name, [])
    assert.equal(outcome.status, 'found')
    if (outcome.status !== 'found') throw new Error('not found')
    const found = outcome.results[0]!
    return { key: found.key, areaId: found.areaId, areaName: found.areaName, areaType: found.areaType }
  }

  it('selections from an older session are pruned away in a new session, so nothing matches', () => {
    const old = sessionA()
    const selected = addSelectedArea(addSelectedArea([], chosen(old, 'Neharpar')), chosen(old, 'Sector 88'))
    const fresh = sessionB()
    assert.deepEqual(pruneSelectedAreas(fresh, selected), [])
    assert.deepEqual(pruneSelectedAreas(null, selected), [])
    const match = matchRoutesByAreas(fresh, pruneSelectedAreas(fresh, selected))
    assert.equal(match.fullMatches.length + match.partialMatches.length, 0)
  })

  it('only the still-present selections survive, and a valid selection is returned as is', () => {
    const old = sessionA()
    const selected = addSelectedArea(addSelectedArea([], chosen(old, 'Neharpar')), chosen(old, 'Sector 88'))
    assert.equal(pruneSelectedAreas(old, selected), selected)
    const sameNeharparOnly = createRouteSession('C', place('S', 5), place('D', 6), [route('c1', 0, [area('n9', 'Neharpar', 1)])], 0)
    assert.deepEqual(pruneSelectedAreas(sameNeharparOnly, selected).map((area) => area.areaName), ['Neharpar'])
  })

  it('search candidates come only from the given session', () => {
    assert.equal(searchAreas(sessionB(), 'Neharpar', []).status, 'no-match')
    assert.equal(searchAreas(null, 'Neharpar', []).status, 'no-routes')
    assert.equal(areaKey(area('x1', 'Neharpar', 1)), chosen(sessionA(), 'Neharpar').key)
  })
})
