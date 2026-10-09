import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRouteSession } from './routeSession.ts'
import { createRouteRequestSlot } from './routeRequestSlot.ts'
import { NO_ROUTE_SESSION, routeSessionReducer, type RouteSessionState } from './routeSessionReducer.ts'

const place = (name: string, lat: number) => ({ name, latitude: lat, longitude: 1 })
const session = (id: string, destination: string) => createRouteSession(id, place('S', 1), place(destination, 2), [], 0)
const run = (state: RouteSessionState, ...actions: Parameters<typeof routeSessionReducer>[1][]) => actions.reduce(routeSessionReducer, state)

describe('route request slot', () => {
  it('refuses a duplicate request for the same locations (repeated Find Routes clicks)', () => {
    const slot = createRouteRequestSlot()
    const first = slot.begin('A')
    assert.ok(first)
    assert.equal(slot.begin('A'), null)
    assert.equal(slot.begin('A'), null)
    assert.equal(slot.isCurrent(first), true)
  })

  it('allows the same request again once it has finished (Try again)', () => {
    const slot = createRouteRequestSlot()
    const first = slot.begin('A')!
    slot.finish(first)
    assert.ok(slot.begin('A'))
  })

  it('a newer request supersedes and cancels the older one; the old response is stale', () => {
    const slot = createRouteRequestSlot()
    const a = slot.begin('A')!
    const b = slot.begin('B')!
    assert.equal(a.controller.signal.aborted, true)
    assert.equal(slot.isCurrent(a), false)
    assert.equal(slot.isCurrent(b), true)
    slot.finish(a) // the old request finishing must not clear the new one
    assert.equal(slot.pendingKey(), 'B')
  })

  it('cancel() aborts the pending request and reports its locations', () => {
    const slot = createRouteRequestSlot()
    const a = slot.begin('A')!
    assert.equal(slot.cancel(), 'A')
    assert.equal(a.controller.signal.aborted, true)
    assert.equal(slot.isCurrent(a), false)
    assert.equal(slot.cancel(), null)
  })
})

describe('route session state under concurrent calculations', () => {
  it('the latest session wins: a stale success cannot overwrite a newer state', () => {
    // A starts, destination changes, B starts and finishes, then A's response arrives late.
    let state = run(NO_ROUTE_SESSION, { type: 'calculationStarted', key: 'A' }, { type: 'calculationStarted', key: 'B' })
    state = run(state, { type: 'calculationSucceeded', key: 'B', session: session('sB', 'B') })
    const afterStale = run(state, { type: 'calculationSucceeded', key: 'A', session: session('sA', 'A') })
    assert.equal(afterStale, state)
    assert.equal(afterStale.status === 'ready' && afterStale.session.id, 'sB')
  })

  it('a stale failure cannot replace newer routes with an error', () => {
    const ready = run(NO_ROUTE_SESSION, { type: 'calculationStarted', key: 'B' }, { type: 'calculationSucceeded', key: 'B', session: session('sB', 'B') })
    assert.equal(run(ready, { type: 'calculationFailed', key: 'A', message: 'x', canTryAgain: true }), ready)
  })

  it('a failure is stored with whether trying again can help, and Try again restarts the calculation', () => {
    const failed = run(NO_ROUTE_SESSION, { type: 'calculationStarted', key: 'A' }, { type: 'calculationFailed', key: 'A', message: 'm', canTryAgain: true })
    assert.deepEqual(failed, { status: 'error', key: 'A', message: 'm', canTryAgain: true })
    assert.deepEqual(run(failed, { type: 'calculationStarted', key: 'A' }), { status: 'loading', key: 'A' })
  })

  it('an abandoned (cancelled) calculation is dropped instead of staying "loading"', () => {
    const loading = run(NO_ROUTE_SESSION, { type: 'calculationStarted', key: 'A' })
    assert.deepEqual(run(loading, { type: 'calculationAbandoned', key: 'A' }), NO_ROUTE_SESSION)
    assert.equal(run(loading, { type: 'calculationAbandoned', key: 'other' }), loading)
  })

  it('old routes never appear together with a new destination: results only apply to their own key', () => {
    const ready = run(NO_ROUTE_SESSION, { type: 'calculationStarted', key: 'A' }, { type: 'calculationSucceeded', key: 'A', session: session('sA', 'A') })
    // The hook shows a state only when state.key equals the current locations' key; a late success for A while
    // B is pending changes nothing.
    const bLoading = run(NO_ROUTE_SESSION, { type: 'calculationStarted', key: 'B' })
    assert.equal(run(bLoading, { type: 'calculationSucceeded', key: 'A', session: session('sA', 'A') }), bLoading)
    assert.equal(ready.status, 'ready')
  })
})
