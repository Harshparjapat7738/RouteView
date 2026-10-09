import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRouteSession } from '../../route/state/routeSession.ts'
import type { AreaType, DetectedArea } from '../../route/types/detectedArea.ts'
import type { Route } from '../../route/types/route.ts'
import {
  addSelectedArea,
  matchedAreasByRoute,
  matchRoutesByAreas,
  normalizeName,
  parseQuery,
  removeSelectedArea,
  searchAreas,
  searchPassingAreas,
  toRouteMatches,
  toSelectedArea,
} from './passingAreaSearchService.ts'
import type { SelectedArea } from '../types/areaSearch.ts'

// Synthetic labels: these tests describe the search rules, not real geography.
function area(id: string, name: string, sequence: number, areaType: AreaType = 'VILLAGE'): DetectedArea {
  return { areaId: id, name, areaType, sequence, positionAlongRoute: 0, distanceFromStartMeters: 0, location: { lat: 1, lng: 1 } }
}

function route(index: number, areas: DetectedArea[]): Route {
  return {
    id: `r${index}`,
    index,
    distanceMeters: 30_000 + index,
    durationSeconds: 2_400 + index,
    summary: '',
    encodedPolyline: 'x',
    path: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }],
    detectedAreas: areas,
  }
}

const location = { name: 'x', latitude: 1, longitude: 1 }
const session = (routes: Route[]) => createRouteSession('s', location, { ...location, latitude: 2 }, routes, 0)

// Route 1: Alpha → Tigaon → Ballabhgarh;  Route 2: Alpha → Tigaon → Neharpar → Sector 88
const A = session([
  route(0, [area('a', 'Alpha', 1), area('t1', 'Tigaon', 2), area('b', 'Ballabhgarh', 3, 'TOWN')]),
  route(1, [area('a', 'Alpha', 1), area('t2', 'Tigaon', 2), area('n', 'Neharpar', 3, 'LOCALITY'), area('s', 'Sector 88', 4, 'SECTOR')]),
])

function found(outcome: ReturnType<typeof searchPassingAreas>) {
  assert.equal(outcome.status, 'found')
  return outcome.status === 'found' ? outcome.results : []
}
const routeIds = (outcome: ReturnType<typeof searchPassingAreas>) =>
  found(outcome).flatMap((result) => result.matchingRoutes.map((match) => match.route.id))

describe('passing-area search', () => {
  it('1 exact match returns the routes containing the area', () => {
    const results = found(searchPassingAreas(A, 'Tigaon'))
    assert.equal(results.length, 1)
    assert.equal(results[0]?.quality, 'exact')
    assert.equal(results[0]?.areaName, 'Tigaon')
    assert.equal(results[0]?.areaType, 'VILLAGE')
  })

  it('2 is case-insensitive and ignores surrounding whitespace', () => {
    const expected = routeIds(searchPassingAreas(A, 'Tigaon'))
    for (const query of ['tigaon', 'TIGAON', 'TiGaOn', '  tigaon  ', '\tTigaon\n']) {
      assert.deepEqual(routeIds(searchPassingAreas(A, query)), expected, query)
    }
    assert.deepEqual(routeIds(searchPassingAreas(A, 'NeHarPar')), ['r1'])
    assert.deepEqual(routeIds(searchPassingAreas(A, ' neharpar ')), ['r1'])
  })

  it('3 partial match finds the area', () => {
    const results = found(searchPassingAreas(A, 'tiga'))
    assert.deepEqual(results.map((result) => result.areaName), ['Tigaon'])
    assert.equal(results[0]?.quality, 'prefix')
    assert.equal(found(searchPassingAreas(A, 'gaon'))[0]?.quality, 'contains')
  })

  it('4 is route-specific: only routes that contain the area', () => {
    assert.deepEqual(routeIds(searchPassingAreas(A, 'Neharpar')), ['r1'])
    assert.deepEqual(routeIds(searchPassingAreas(A, 'Ballabhgarh')), ['r0'])
    const match = found(searchPassingAreas(A, 'Neharpar'))[0]?.matchingRoutes[0]
    assert.equal(match?.area.sequence, 3, 'carries the area’s place in that route’s journey')
    assert.equal(match?.route, A.routes[1], 'reuses the session’s own route object')
  })

  it('5 an area on several routes returns all of them, once, as one result', () => {
    const results = found(searchPassingAreas(A, 'Tigaon'))
    assert.equal(results.length, 1, 'records with different ids but the same name and type are one area')
    assert.deepEqual(results[0]?.matchingRoutes.map((match) => match.route.id), ['r0', 'r1'])
  })

  it('6 reports no match for unknown text', () => {
    assert.deepEqual(searchPassingAreas(A, 'XYZABC'), { status: 'no-match', query: 'XYZABC' })
  })

  it('7 reports that there are no routes without a session, or with an empty one', () => {
    assert.deepEqual(searchPassingAreas(null, 'Tigaon'), { status: 'no-routes' })
    assert.deepEqual(searchPassingAreas(session([]), 'Tigaon'), { status: 'no-routes' })
    assert.deepEqual(searchPassingAreas(null, ''), { status: 'no-routes' })
  })

  it('an empty or blank query shows nothing', () => {
    assert.deepEqual(searchPassingAreas(A, ''), { status: 'empty-query' })
    assert.deepEqual(searchPassingAreas(A, '   '), { status: 'empty-query' })
  })

  it('ranks exact, then prefix, then contains', () => {
    const s = session([
      route(0, [area('1', 'New Sector 88 Area', 1), area('2', 'Sector 88 Extension', 2), area('3', 'Sector 88', 3, 'SECTOR')]),
    ])
    const names = found(searchPassingAreas(s, 'sector 88')).map((result) => [result.areaName, result.quality])
    assert.deepEqual(names, [
      ['Sector 88', 'exact'],
      ['Sector 88 Extension', 'prefix'],
      ['New Sector 88 Area', 'contains'],
    ])
  })

  it('is deterministic for equal quality', () => {
    const s = session([route(0, [area('1', 'Beta Nagar', 1), area('2', 'Beta Colony', 2)])])
    const first = found(searchPassingAreas(s, 'beta')).map((r) => r.areaName)
    assert.deepEqual(first, found(searchPassingAreas(s, 'beta')).map((r) => r.areaName))
    assert.deepEqual(first, ['Beta Colony', 'Beta Nagar'])
  })

  it('treats the same name with different types as different areas', () => {
    const s = session([route(0, [area('1', 'Alpha', 1, 'VILLAGE')]), route(1, [area('2', 'Alpha', 1, 'TOWN')])])
    assert.equal(found(searchPassingAreas(s, 'alpha')).length, 2)
  })

  it('searches only detected areas: a route without areas matches nothing', () => {
    assert.equal(searchPassingAreas(session([route(0, [])]), 'tigaon').status, 'no-match')
  })

  it('does not interpret regular-expression characters', () => {
    assert.equal(searchPassingAreas(A, '.*').status, 'no-match')
    assert.equal(searchPassingAreas(A, '(').status, 'no-match')
  })

  it('normalises names and caps the query length', () => {
    assert.equal(normalizeName('  Sector   88 '), 'sector 88')
    assert.equal(parseQuery('x'.repeat(500))?.text.length, 100)
    assert.equal(parseQuery('   '), null)
  })

  it('lists the matched areas per matching route and nothing for other routes', () => {
    const byRoute = matchedAreasByRoute(searchPassingAreas(A, 'neharpar'))
    assert.deepEqual([...byRoute.keys()], ['r1'])
    assert.equal(byRoute.get('r1')?.[0]?.name, 'Neharpar')
    assert.deepEqual([...matchedAreasByRoute(searchPassingAreas(A, 'tigaon')).keys()], ['r0', 'r1'])
    assert.equal(matchedAreasByRoute(searchPassingAreas(A, 'sector')).get('r1')?.length, 1)
    assert.equal(matchedAreasByRoute(searchPassingAreas(A, 'nothing')).size, 0)
    assert.equal(matchedAreasByRoute(searchPassingAreas(null, 'x')).size, 0)
  })
})

// ---- Multi-area search -----------------------------------------------------------------------------------------
// Route 0: Alpha → Tigaon → Ballabhgarh
// Route 1: Alpha → Tigaon → Neharpar → Sector 88
// Route 2: Sector 88 → Neharpar → Alpha   (the same places in a different order)
const M = session([
  ...A.routes,
  route(2, [area('s3', 'Sector 88', 1, 'SECTOR'), area('n3', 'Neharpar', 2, 'LOCALITY'), area('a3', 'Alpha', 3)]),
])

function pick(name: string): SelectedArea {
  const result = found(searchPassingAreas(M, name)).find((r) => r.areaName.toLowerCase() === name.toLowerCase())
  assert.ok(result, name)
  return toSelectedArea(result)
}
const full = (names: string[]) => matchRoutesByAreas(M, names.map(pick)).fullMatches.map((m) => m.route.id)

describe('multi-area search', () => {
  it('one selected area behaves like the single-area search', () => {
    assert.deepEqual(full(['Neharpar']), ['r1', 'r2'])
    assert.deepEqual(full(['Neharpar']), routeIds(searchPassingAreas(M, 'Neharpar')))
  })

  it('two selected areas keep only routes with both', () => {
    assert.deepEqual(full(['Tigaon', 'Neharpar']), ['r1'])
    assert.deepEqual(full(['Neharpar', 'Sector 88']), ['r1', 'r2'])
  })

  it('three selected areas keep only routes with all three', () => {
    assert.deepEqual(full(['Alpha', 'Neharpar', 'Sector 88']), ['r1', 'r2'])
    assert.deepEqual(full(['Alpha', 'Tigaon', 'Neharpar']), ['r1'])
  })

  it('a route with all areas is a full match; a route with some is only partial', () => {
    const result = matchRoutesByAreas(M, [pick('Tigaon'), pick('Neharpar')])
    assert.deepEqual(result.fullMatches.map((m) => m.route.id), ['r1'])
    assert.deepEqual(result.partialMatches.map((m) => m.route.id), ['r0', 'r2'])
    assert.equal(result.partialMatches[0]?.complete, false)
    const views = toRouteMatches(result)
    assert.equal(views.get('r1')?.complete, true)
    assert.equal(views.get('r0')?.complete, false)
    assert.equal(views.get('r0')?.expected, 2)
    assert.equal(views.has('r2'), true, 'r2 has Neharpar only')
  })

  it('no route having all areas gives no full match (and no recalculation is needed)', () => {
    const result = matchRoutesByAreas(M, [pick('Ballabhgarh'), pick('Sector 88')])
    assert.equal(result.fullMatches.length, 0)
    assert.equal(result.partialMatches.length, 3, 'r0 has one, r1 and r2 have the other')
  })

  it('duplicate selected areas are counted once', () => {
    const tigaon = pick('Tigaon')
    const list = addSelectedArea(addSelectedArea([], tigaon), { ...tigaon })
    assert.equal(list.length, 1)
    assert.equal(addSelectedArea(list, { ...tigaon, key: 'other|VILLAGE' }).length, 1, 'same id')
    const result = matchRoutesByAreas(M, [tigaon, tigaon, pick('Alpha')])
    assert.equal(result.selected.length, 2)
    assert.deepEqual(result.fullMatches.map((m) => m.route.id), ['r0', 'r1'])
  })

  it('preserves each route’s own order, never selection order or alphabetical order', () => {
    const names = (id: string, order: string[]) =>
      matchRoutesByAreas(M, order.map(pick)).fullMatches.find((m) => m.route.id === id)?.matchedAreas.map((a) => a.name)
    assert.deepEqual(names('r1', ['Sector 88', 'Alpha', 'Neharpar']), ['Alpha', 'Neharpar', 'Sector 88'])
    assert.deepEqual(names('r2', ['Alpha', 'Neharpar', 'Sector 88']), ['Sector 88', 'Neharpar', 'Alpha'])
  })

  it('suggestions are case-insensitive and ranked exact > prefix > contains', () => {
    const s = session([
      route(0, [area('1', 'New Sector 88 Area', 1), area('2', 'Sector 88 Extension', 2), area('3', 'Sector 88', 3, 'SECTOR')]),
    ])
    const outcome = searchAreas(s, '  SECTOR 88 ', [])
    assert.deepEqual(found(outcome).map((r) => r.quality), ['exact', 'prefix', 'contains'])
  })

  it('suggestions leave out areas that are already selected', () => {
    const selected = [pick('Tigaon')]
    assert.deepEqual(found(searchAreas(M, 'tiga', [])).map((r) => r.areaName), ['Tigaon'])
    assert.equal(searchAreas(M, 'tiga', selected).status, 'no-match')
    assert.deepEqual(found(searchAreas(M, 'a', selected)).some((r) => r.areaName === 'Tigaon'), false)
  })

  it('removing one area keeps the others; clearing all returns to no filter', () => {
    const list = [pick('Tigaon'), pick('Neharpar'), pick('Alpha')].reduce<readonly SelectedArea[]>(addSelectedArea, [])
    const without = removeSelectedArea(list, pick('Neharpar').key)
    assert.deepEqual(without.map((a) => a.areaName), ['Tigaon', 'Alpha'])
    assert.deepEqual(matchRoutesByAreas(M, without).fullMatches.map((m) => m.route.id), ['r0', 'r1'])
    const none = matchRoutesByAreas(M, [])
    assert.equal(none.fullMatches.length + none.partialMatches.length, 0)
  })

  it('a new Route Session invalidates old selections: they match nothing in other routes', () => {
    const old = [pick('Neharpar')]
    const fresh = session([route(0, [area('x', 'Gamma', 1)])])
    const result = matchRoutesByAreas(fresh, old)
    assert.equal(result.fullMatches.length, 0)
    assert.equal(matchRoutesByAreas(null, old).fullMatches.length, 0)
  })

  it('missing or empty detected areas never match', () => {
    const empty = session([route(0, [])])
    assert.equal(matchRoutesByAreas(empty, [pick('Alpha')]).fullMatches.length, 0)
  })

  it('an area repeated on one route uses its first occurrence', () => {
    const s = session([route(0, [area('a', 'Alpha', 1), area('t', 'Tigaon', 2), area('a2', 'Alpha', 3)])])
    const alpha = toSelectedArea(found(searchPassingAreas(s, 'alpha'))[0]!)
    const match = matchRoutesByAreas(s, [alpha, toSelectedArea(found(searchPassingAreas(s, 'tigaon'))[0]!)]).fullMatches[0]
    assert.deepEqual(match?.matchedAreas.map((a) => a.sequence), [1, 2])
  })
})
