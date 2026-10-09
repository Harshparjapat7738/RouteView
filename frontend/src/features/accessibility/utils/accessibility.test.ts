import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { A, B, C, D, E, rawBusJourney } from '../../bus/utils/busFixture.ts'
import { parseBusJourney } from '../../bus/utils/parseBus.ts'
import { journey as metroJourney } from '../../metro/utils/metroFixture.ts'
import type { MetroJourney, MetroSegment, MetroStationRef } from '../../metro/types/metro.ts'
import { DEFAULT_PREFERENCES, type TravelPreferences } from '../../preferences/types/preferences.ts'
import { applyPreferences } from '../../preferences/utils/applyPreferences.ts'
import { describeAccessibility, summarizePreferences } from '../../preferences/utils/describePreferences.ts'
import { PREFERENCES_KEY, loadPreferences, parsePreferences, savePreferences, serializePreferences, type PreferencesBackend } from '../../preferences/utils/preferencesData.ts'
import type { Route } from '../../route/types/route.ts'
import type { AccessStatus, Accessibility } from '../types/accessibility.ts'
import { assessRouteAccess } from './assessRoute.ts'
import { describeRouteAccess } from './describeAccess.ts'
import { parseAccessibility } from './parseAccessibility.ts'

const stated = (status: AccessStatus): Accessibility => ({ status, source: 'DMRC GTFS', sourceVersion: '2023-08-10' })
const base = (id: string, index: number, duration = 1000): Route => ({ id, index, distanceMeters: 1000, durationSeconds: duration, summary: '', encodedPolyline: 'x', path: [], detectedAreas: [] })

/** A metro route whose stations (by name) carry the given statements; any station not listed has none (unknown). */
function metro(id: string, index: number, access: Record<string, AccessStatus>, over: Partial<MetroJourney> = {}, duration = 1000): Route {
  const tag = (s: MetroStationRef | null): MetroStationRef | null => (s && access[s.name] ? { ...s, accessibility: stated(access[s.name] as AccessStatus) } : s)
  const j = metroJourney(over)
  const segments: MetroSegment[] = j.segments.map((s) => ({ ...s, boarding: tag(s.boarding), exit: tag(s.exit), transferStation: tag(s.transferStation), transferToStation: tag(s.transferToStation) }))
  return { ...base(id, index, duration), metro: { ...j, segments } }
}

function bus(id: string, index: number, access: Record<string, AccessStatus>, duration = 1000): Route {
  const tag = <T extends { name: string }>(stop: T) => (access[stop.name] ? { ...stop, accessibility: { status: access[stop.name], source: 'DTC GTFS', sourceVersion: 'v-real' } } : stop)
  const raw = rawBusJourney({
    segments: rawBusJourney().segments.map((segment) => {
      const s = segment as unknown as Record<string, { name: string } | undefined>
      const out: Record<string, unknown> = { ...s }
      for (const field of ['boarding', 'exit', 'transferStop']) if (s[field]) out[field] = tag(s[field])
      return out
    }),
    stops: [A, B, C, D, E].map(tag),
  })
  return { ...base(id, index, duration), bus: parseBusJourney(raw) }
}

const prefs = (accessibility: Partial<TravelPreferences['accessibility']>, prefer: Partial<TravelPreferences['prefer']> = {}, avoid: TravelPreferences['avoid'] = []): TravelPreferences => ({
  prefer: { ...DEFAULT_PREFERENCES.prefer, ...prefer },
  accessibility: { ...DEFAULT_PREFERENCES.accessibility, ...accessibility },
  avoid,
})
const ids = (routes: readonly Route[]) => routes.map((r) => r.id)
const ALL = { Alpha: 'ACCESSIBLE', Central: 'ACCESSIBLE', Zulu: 'ACCESSIBLE' } as const

describe('reading accessibility from a response', () => {
  it('keeps only explicit ACCESSIBLE / INACCESSIBLE statements', () => {
    assert.deepEqual(parseAccessibility({ status: 'ACCESSIBLE', source: 'DMRC', sourceVersion: '2023' }), { status: 'ACCESSIBLE', source: 'DMRC', sourceVersion: '2023' })
    assert.equal(parseAccessibility({ status: 'INACCESSIBLE', source: 'DMRC', sourceVersion: '2023' }).status, 'INACCESSIBLE')
  })

  it('treats anything else as unknown, never accessible', () => {
    for (const bad of [undefined, null, 'ACCESSIBLE', true, 1, [], {}, { status: 'UNKNOWN' }, { status: 'accessible' }, { status: 'YES' }, { status: 'ACCESSIBLE_MAYBE' }, { status: 7 }]) {
      assert.deepEqual(parseAccessibility(bad), { status: 'UNKNOWN', source: null, sourceVersion: null }, JSON.stringify(bad))
    }
  })

  it('cleans the source text and tolerates a missing source', () => {
    assert.deepEqual(parseAccessibility({ status: 'ACCESSIBLE', source: '  DMRC \n GTFS ', sourceVersion: 5 }), { status: 'ACCESSIBLE', source: 'DMRC GTFS', sourceVersion: null })
    assert.equal(parseAccessibility({ status: 'ACCESSIBLE', source: 'x'.repeat(500) }).source?.length, 100)
  })

  it('bus stops parse with and without data; no field means unknown', () => {
    const route = bus('b', 0, { 'Stop A': 'ACCESSIBLE', 'Stop E': 'INACCESSIBLE' })
    const stops = route.bus!.stops
    assert.equal(stops.find((s) => s.name === 'Stop A')?.accessibility?.status, 'ACCESSIBLE')
    assert.equal(stops.find((s) => s.name === 'Stop A')?.accessibility?.source, 'DTC GTFS')
    assert.equal(stops.find((s) => s.name === 'Stop E')?.accessibility?.status, 'INACCESSIBLE')
    assert.equal(stops.find((s) => s.name === 'Stop B')?.accessibility?.status, 'UNKNOWN')
    const none = parseBusJourney(rawBusJourney())!
    assert.ok(none.stops.every((s) => s.accessibility?.status === 'UNKNOWN'))
  })
})

describe('assessing a route', () => {
  it('metro: every boarding, exit and change station listed accessible', () => {
    const access = assessRouteAccess(metro('m', 0, ALL))
    assert.equal(access.applicable, true)
    assert.deepEqual(access.points.map((p) => p.name), ['Alpha', 'Central', 'Zulu']) // the change station appears once
    assert.equal(access.level, 'ALL_LISTED')
    assert.equal(access.accessible, 3)
  })

  it('metro: one station listed as not accessible is a warning that outranks the rest', () => {
    const access = assessRouteAccess(metro('m', 0, { ...ALL, Central: 'INACCESSIBLE' }))
    assert.equal(access.level, 'HAS_INACCESSIBLE')
    assert.deepEqual([access.accessible, access.inaccessible, access.unknown], [2, 1, 0])
    assert.match(describeRouteAccess(access) ?? '', /not accessible: Central/)
  })

  it('metro: missing metadata is unknown, not accessible', () => {
    assert.equal(assessRouteAccess(metro('m', 0, {})).level, 'UNKNOWN')
    const partial = assessRouteAccess(metro('m', 0, { Alpha: 'ACCESSIBLE', Zulu: 'ACCESSIBLE' }))
    assert.equal(partial.level, 'PARTIAL')
    assert.equal(partial.unknown, 1)
    assert.equal(partial.points.find((p) => p.name === 'Central')?.accessibility.status, 'UNKNOWN')
  })

  it('metro: a station that matched nothing in the dataset has no statement', () => {
    const route = metro('m', 0, ALL)
    const seg = route.metro!.segments.map((s) => (s.type === 'METRO' && s.boarding?.name === 'Alpha' ? { ...s, boarding: { ...s.boarding, stationId: null, accessibility: undefined } } : s))
    const access = assessRouteAccess({ ...route, metro: { ...route.metro!, segments: seg } })
    assert.equal(access.points.find((p) => p.name === 'Alpha')?.accessibility.status, 'UNKNOWN')
    assert.equal(access.level, 'PARTIAL')
  })

  it('stations the rider only passes through are not relevant', () => {
    const route = metro('m', 0, { ...ALL, Bravo: 'INACCESSIBLE' })
    const access = assessRouteAccess(route)
    assert.equal(access.points.some((p) => p.name === 'Bravo'), false)
    assert.equal(access.level, 'ALL_LISTED')
  })

  it('bus: boarding, exit and transfer stops', () => {
    const access = assessRouteAccess(bus('b', 0, { 'Stop A': 'ACCESSIBLE', 'Stop C': 'ACCESSIBLE', 'Stop E': 'ACCESSIBLE' }))
    assert.deepEqual(access.points.map((p) => p.name), ['Stop A', 'Stop C', 'Stop E'])
    assert.equal(access.level, 'ALL_LISTED')
    assert.equal(assessRouteAccess(bus('b', 0, { 'Stop A': 'ACCESSIBLE', 'Stop C': 'INACCESSIBLE' })).level, 'HAS_INACCESSIBLE')
    assert.equal(assessRouteAccess(bus('b', 0, {})).level, 'UNKNOWN')
  })

  it('routes without station data make no claim at all', () => {
    assert.equal(assessRouteAccess(base('car', 0)).applicable, false)
    const google = { ...base('g', 0), transit: { steps: [], transfers: 0, departureTime: null, arrivalTime: null, fare: null } } as unknown as Route
    assert.equal(assessRouteAccess(google).applicable, false)
    assert.equal(describeRouteAccess(assessRouteAccess(base('car', 0))), null)
  })

  it('never describes a route as an accessible journey', () => {
    for (const status of [{ ...ALL }, { Alpha: 'ACCESSIBLE' as const }, {}, { Central: 'INACCESSIBLE' as const }] as Record<string, AccessStatus>[]) {
      const text = describeRouteAccess(assessRouteAccess(metro('m', 0, status))) ?? ''
      assert.doesNotMatch(text, /wheelchair.accessible (journey|route)|fully accessible|step-free journey/i, text)
    }
    assert.match(describeRouteAccess(assessRouteAccess(metro('m', 0, ALL))) ?? '', /Lifts, step-free connections.*not verified/)
  })
})

describe('accessibility preferences', () => {
  const accessibleRoute = () => metro('a', 0, ALL, {}, 3000)
  const badRoute = () => metro('b', 1, { ...ALL, Zulu: 'INACCESSIBLE' }, {}, 1000)
  const unknownRoute = () => metro('u', 2, {}, {}, 2000)

  it('does nothing and reports nothing when both switches are off', () => {
    const routes = [badRoute(), accessibleRoute(), unknownRoute()]
    const out = applyPreferences(routes, 'METRO', prefs({}))
    assert.deepEqual(ids(out.routes), ['b', 'a', 'u'])
    assert.equal(out.outcome.accessibility, null)
  })

  it('step-free puts verified routes first, then unknown, then a listed-inaccessible station; nothing is hidden', () => {
    const out = applyPreferences([badRoute(), unknownRoute(), accessibleRoute()], 'METRO', prefs({ stepFree: true }))
    assert.deepEqual(ids(out.routes), ['a', 'u', 'b'])
    assert.equal(out.outcome.accessibility?.ranked, true)
    assert.equal(out.outcome.accessibility?.verifiedRoutes, 1)
    assert.equal(out.outcome.accessibility?.hiddenInaccessible, 0)
  })

  it('a partly known route ranks between verified and unknown', () => {
    const partial = metro('p', 3, { Alpha: 'ACCESSIBLE' })
    assert.deepEqual(ids(applyPreferences([unknownRoute(), partial, accessibleRoute()], 'METRO', prefs({ stepFree: true })).routes), ['a', 'p', 'u'])
  })

  it('unknown is never treated as accessible: with no data nothing is verified and the limitation is explained', () => {
    const routes = [unknownRoute(), metro('v', 3, {})]
    const out = applyPreferences(routes, 'METRO', prefs({ stepFree: true }))
    assert.deepEqual(ids(out.routes), ['u', 'v']) // all routes still offered, order unchanged
    assert.equal(out.outcome.accessibility?.verifiedRoutes, 0)
    assert.equal(out.outcome.accessibility?.ranked, false)
    const text = describeAccessibility(out.outcome).join(' ')
    assert.match(text, /No route could be verified as step-free/)
    assert.match(text, /not guaranteed/)
  })

  it('avoid hides routes with a station listed as not accessible when an alternative exists', () => {
    const out = applyPreferences([badRoute(), accessibleRoute(), unknownRoute()], 'METRO', prefs({ avoidInaccessible: true }))
    assert.deepEqual(ids(out.routes), ['a', 'u'])
    assert.equal(out.outcome.accessibility?.hiddenInaccessible, 1)
    assert.match(describeAccessibility(out.outcome).join(' '), /1 route hidden because it uses a station listed as not accessible/)
    assert.equal(out.outcome.noMatch, false)
  })

  it('avoid never leaves the person with nothing: if every route has such a station, all stay and it says so', () => {
    const routes = [badRoute(), metro('c', 1, { Alpha: 'INACCESSIBLE' })]
    const out = applyPreferences(routes, 'METRO', prefs({ avoidInaccessible: true }))
    assert.deepEqual(ids(out.routes), ['b', 'c'])
    assert.equal(out.outcome.accessibility?.allInaccessible, true)
    assert.equal(out.outcome.accessibility?.hiddenInaccessible, 0)
    assert.match(describeAccessibility(out.outcome).join(' '), /Every route uses a station listed as not accessible, so none was hidden/)
  })

  it('avoid with no statements at all cannot rule anything out and says so', () => {
    const out = applyPreferences([unknownRoute(), metro('v', 3, {})], 'METRO', prefs({ avoidInaccessible: true }))
    assert.deepEqual(ids(out.routes), ['u', 'v'])
    assert.match(describeAccessibility(out.outcome).join(' '), /accessibility is unknown for 2 routes, so none could be ruled out/)
  })

  it('works for bus routes the same way', () => {
    const ok = bus('ok', 0, { 'Stop A': 'ACCESSIBLE', 'Stop C': 'ACCESSIBLE', 'Stop E': 'ACCESSIBLE' }, 2000)
    const no = bus('no', 1, { 'Stop A': 'ACCESSIBLE', 'Stop C': 'INACCESSIBLE', 'Stop E': 'ACCESSIBLE' }, 1000)
    assert.deepEqual(ids(applyPreferences([no, ok], 'BUS', prefs({ stepFree: true })).routes), ['ok', 'no'])
    assert.deepEqual(ids(applyPreferences([no, ok], 'BUS', prefs({ avoidInaccessible: true })).routes), ['ok'])
  })

  it('is reported as not applicable for routes without station data (cars, walking, trains)', () => {
    const routes = [base('x', 0), base('y', 1)]
    for (const mode of ['FOUR_WHEELER', 'WALKING', 'CYCLING', 'TRAIN'] as const) {
      const out = applyPreferences(routes, mode, prefs({ stepFree: true, avoidInaccessible: true }))
      assert.deepEqual(ids(out.routes), ['x', 'y'], mode)
      assert.equal(out.outcome.accessibility?.applicable, false)
      assert.match(describeAccessibility(out.outcome).join(' '), /only for Metro and Bus/)
    }
  })

  it('step-free is the first key; less walking orders routes within the same tier', () => {
    const near = metro('near', 0, ALL, { walkingMeters: 100 })
    const far = metro('far', 1, ALL, { walkingMeters: 900 })
    const unknownNear = metro('un', 2, {}, { walkingMeters: 10 })
    const out = applyPreferences([unknownNear, far, near], 'METRO', prefs({ stepFree: true }, { lessWalking: true }))
    assert.deepEqual(ids(out.routes), ['near', 'far', 'un'])
    assert.deepEqual(out.outcome.ranked, ['lessWalking'])
  })

  it('less walking alone ranks by walking and makes no accessibility claim', () => {
    const near = metro('near', 0, {}, { walkingMeters: 100 })
    const far = metro('far', 1, ALL, { walkingMeters: 900 })
    const out = applyPreferences([far, near], 'METRO', prefs({}, { lessWalking: true }))
    assert.deepEqual(ids(out.routes), ['near', 'far'])
    assert.equal(out.outcome.accessibility, null)
  })

  it('keeps the routes themselves untouched (transfers and station relationships preserved)', () => {
    const route = accessibleRoute()
    const out = applyPreferences([route, unknownRoute()], 'METRO', prefs({ stepFree: true, avoidInaccessible: true }))
    assert.equal(out.routes[0], route)
    assert.equal(out.routes[0]?.metro?.segments.length, 5)
  })

  it('travel-mode avoiding still applies first', () => {
    const out = applyPreferences([bus('b1', 0, {}), accessibleRoute()], 'METRO', prefs({ stepFree: true }, {}, ['BUS']))
    assert.ok(!ids(out.routes).includes('b1'))
  })

  it('describes the verified count with the limits stated', () => {
    const out = applyPreferences([accessibleRoute(), unknownRoute()], 'METRO', prefs({ stepFree: true }))
    const text = describeAccessibility(out.outcome).join(' ')
    assert.match(text, /1 route of 2 has every station listed as accessible and come first/)
    assert.match(text, /not verified/)
  })
})

describe('accessibility preference storage', () => {
  const mem = (value: string | null): PreferencesBackend & { value: string | null } => ({ value, getItem() { return this.value }, setItem(_k: string, v: string) { this.value = v }, removeItem() { this.value = null } })

  it('is off by default and written only when on', () => {
    assert.deepEqual(DEFAULT_PREFERENCES.accessibility, { stepFree: false, avoidInaccessible: false })
    assert.ok(!('accessibility' in JSON.parse(serializePreferences(prefs({}, { fastest: true })))))
    const store = mem(null)
    assert.equal(savePreferences(prefs({ stepFree: true }), store), true)
    assert.deepEqual(loadPreferences(store).accessibility, { stepFree: true, avoidInaccessible: false })
    savePreferences(DEFAULT_PREFERENCES, store)
    assert.equal(store.value, null)
    assert.equal(PREFERENCES_KEY, 'routeview.preferences')
  })

  it('data from before this feature stays valid and means off', () => {
    const old = JSON.stringify({ version: 1, prefer: { fastest: true }, avoid: [] })
    const parsed = parsePreferences(old)
    assert.equal(parsed.status, 'ok')
    assert.deepEqual(parsed.preferences.accessibility, { stepFree: false, avoidInaccessible: false })
    assert.equal(parsed.preferences.prefer.fastest, true)
  })

  it('only a literal true turns a switch on', () => {
    for (const bad of ['yes', 1, 'true', null, {}, []]) {
      const parsed = parsePreferences(JSON.stringify({ version: 1, prefer: {}, avoid: [], accessibility: { stepFree: bad, avoidInaccessible: bad } }))
      assert.deepEqual(parsed.preferences.accessibility, { stepFree: false, avoidInaccessible: false }, JSON.stringify(bad))
    }
    assert.deepEqual(parsePreferences(JSON.stringify({ version: 1, prefer: {}, avoid: [], accessibility: 'x' })).preferences.accessibility, { stepFree: false, avoidInaccessible: false })
  })

  it('shows up in the one-line summary', () => {
    assert.equal(summarizePreferences(prefs({ stepFree: true })), 'Step-free stations')
    assert.equal(summarizePreferences(prefs({ stepFree: true, avoidInaccessible: true }, { lessWalking: true }, ['BUS'])), 'Less walking, Step-free stations · Avoiding Bus, inaccessible stations')
  })
})

describe('station roles', () => {
  it('a station where the rider leaves one ride and joins the next is a change', () => {
    const access = assessRouteAccess(metro('m', 0, ALL))
    assert.deepEqual(access.points.map((p) => [p.name, p.kind]), [['Alpha', 'BOARDING'], ['Central', 'TRANSFER'], ['Zulu', 'EXIT']])
  })
})
