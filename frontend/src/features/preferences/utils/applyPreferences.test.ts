import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rawBusJourney } from '../../bus/utils/busFixture.ts'
import { parseBusJourney } from '../../bus/utils/parseBus.ts'
import { journey as metroJourney } from '../../metro/utils/metroFixture.ts'
import type { Route } from '../../route/types/route.ts'
import { DEFAULT_PREFERENCES, type TravelPreferences } from '../types/preferences.ts'
import { applyPreferences } from './applyPreferences.ts'
import { describeHidden, describeRanking, describeUnapplied, summarizePreferences } from './describePreferences.ts'
import { PREFERENCES_KEY, loadPreferences, parsePreferences, savePreferences, serializePreferences, type PreferencesBackend } from './preferencesData.ts'
import { modesOfRoute, vehicleMode } from './routeModes.ts'

const prefs = (prefer: Partial<TravelPreferences['prefer']> = {}, avoid: TravelPreferences['avoid'] = [], accessibility: Partial<TravelPreferences['accessibility']> = {}): TravelPreferences => ({
  prefer: { ...DEFAULT_PREFERENCES.prefer, ...prefer },
  accessibility: { ...DEFAULT_PREFERENCES.accessibility, ...accessibility },
  avoid,
})
const base = (id: string, index: number, durationSeconds: number): Route => ({
  id, index, distanceMeters: 1000 * (index + 1), durationSeconds, summary: '', encodedPolyline: 'x', path: [], detectedAreas: [],
})
const metro = (id: string, index: number, duration: number, over: Parameters<typeof metroJourney>[0] = {}): Route => ({ ...base(id, index, duration), metro: metroJourney(over) })
const bus = (id: string, index: number, duration: number, over: Record<string, unknown> = {}): Route => ({ ...base(id, index, duration), bus: parseBusJourney(rawBusJourney(over)) })
const ids = (routes: readonly Route[]) => routes.map((route) => route.id)

describe('ranking preferences', () => {
  const routes = [
    metro('a', 0, 3000, { transfers: 2, walkingMeters: 900, fare: { currency: 'INR', amount: '40' } }),
    metro('b', 1, 2400, { transfers: 1, walkingMeters: 700, fare: { currency: 'INR', amount: '50' } }),
    metro('c', 2, 3600, { transfers: 0, walkingMeters: 300, fare: { currency: 'INR', amount: '30' } }),
  ]

  it('keeps the provider order when no preference is on', () => {
    const { routes: out, outcome } = applyPreferences(routes, 'METRO', DEFAULT_PREFERENCES)
    assert.deepEqual(ids(out), ['a', 'b', 'c'])
    assert.deepEqual(outcome.ranked, [])
    assert.equal(outcome.hiddenCount, 0)
  })

  it('fastest orders by duration', () => assert.deepEqual(ids(applyPreferences(routes, 'METRO', prefs({ fastest: true })).routes), ['b', 'a', 'c']))
  it('lowest fare orders by fare', () => assert.deepEqual(ids(applyPreferences(routes, 'METRO', prefs({ lowestFare: true })).routes), ['c', 'a', 'b']))
  it('fewer transfers orders by transfers', () => assert.deepEqual(ids(applyPreferences(routes, 'METRO', prefs({ fewerTransfers: true })).routes), ['c', 'b', 'a']))
  it('less walking orders by walking distance', () => assert.deepEqual(ids(applyPreferences(routes, 'METRO', prefs({ lessWalking: true })).routes), ['c', 'b', 'a']))

  it('conflicting preferences are balanced by rank, and ties fall back to provider order', () => {
    // fastest: b(1) a(2) c(3); fewer transfers: c(1) b(2) a(3) -> totals a=5 b=3 c=4
    const out = applyPreferences(routes, 'METRO', prefs({ fastest: true, fewerTransfers: true }))
    assert.deepEqual(ids(out.routes), ['b', 'c', 'a'])
    assert.deepEqual(out.outcome.ranked, ['fastest', 'fewerTransfers'])
    // fastest vs lowest fare are exact opposites here: a tie on totals keeps provider order.
    const tie = [metro('x', 0, 3000, { fare: { currency: 'INR', amount: '40' } }), metro('y', 1, 2000, { fare: { currency: 'INR', amount: '50' } })]
    assert.deepEqual(ids(applyPreferences(tie, 'METRO', prefs({ fastest: true, lowestFare: true })).routes), ['x', 'y'])
  })

  it('never removes a route by ranking', () => {
    const out = applyPreferences(routes, 'METRO', prefs({ fastest: true, lowestFare: true, fewerTransfers: true, lessWalking: true }))
    assert.equal(out.routes.length, 3)
    assert.equal(out.outcome.hiddenCount, 0)
  })

  it('does not change route objects or their indexes', () => {
    const out = applyPreferences(routes, 'METRO', prefs({ fastest: true }))
    assert.equal(out.routes[0], routes[1])
    assert.deepEqual(out.routes.map((route) => route.index), [1, 0, 2])
  })
})

describe('missing data', () => {
  it('never invents a fare: bus fares are not available, so the preference is reported and the order kept', () => {
    const routes = [bus('a', 0, 3000), bus('b', 1, 2500)]
    const out = applyPreferences(routes, 'BUS', prefs({ lowestFare: true }))
    assert.deepEqual(ids(out.routes), ['a', 'b'])
    assert.equal(out.outcome.criteria[0]?.status, 'unavailable')
    assert.match(describeUnapplied(out.outcome)[0] ?? '', /Lowest fare could not be applied\. Bus fares are not available/)
    assert.equal(describeRanking(out.outcome), null)
  })

  it('does not rank by fare when one metro route has none, or the currencies differ', () => {
    const some = [metro('a', 0, 3000, { fare: { currency: 'INR', amount: '40' } }), metro('b', 1, 2500, { fare: null })]
    const out = applyPreferences(some, 'METRO', prefs({ lowestFare: true }))
    assert.deepEqual(ids(out.routes), ['a', 'b'])
    assert.equal(out.outcome.criteria[0]?.status, 'unavailable')
    const mixed = [metro('a', 0, 3000, { fare: { currency: 'INR', amount: '40' } }), metro('b', 1, 2500, { fare: { currency: 'USD', amount: '1' } })]
    assert.equal(applyPreferences(mixed, 'METRO', prefs({ lowestFare: true })).outcome.criteria[0]?.status, 'unavailable')
  })

  it('applies the preferences that have data and reports the one that does not', () => {
    const routes = [bus('a', 0, 3000, { transfers: 2 }), bus('b', 1, 2500, { transfers: 0 })]
    const out = applyPreferences(routes, 'BUS', prefs({ lowestFare: true, fewerTransfers: true }))
    assert.deepEqual(ids(out.routes), ['b', 'a'])
    assert.deepEqual(out.outcome.ranked, ['fewerTransfers'])
    assert.equal(describeUnapplied(out.outcome).length, 1)
  })

  it('says a preference does not apply to a single-leg mode, and keeps the order', () => {
    const routes = [base('a', 0, 3000), base('b', 1, 2500)]
    const out = applyPreferences(routes, 'FOUR_WHEELER', prefs({ fewerTransfers: true, lessWalking: true, lowestFare: true }))
    assert.deepEqual(ids(out.routes), ['a', 'b'])
    assert.deepEqual(out.outcome.criteria.map((criterion) => criterion.status), ['unavailable', 'not-applicable', 'not-applicable'])
    assert.match(describeUnapplied(out.outcome).join(' '), /Transfers do not apply to Four Wheeler/)
  })

  it('does not drop the only route when information is missing', () => {
    const out = applyPreferences([bus('only', 0, 3000)], 'BUS', prefs({ lowestFare: true, fastest: true }))
    assert.deepEqual(ids(out.routes), ['only'])
    assert.equal(out.outcome.noMatch, false)
  })

  it('treats equal values as no difference, not as a ranking', () => {
    const routes = [metro('a', 0, 3000), metro('b', 1, 3000)]
    const out = applyPreferences(routes, 'METRO', prefs({ fastest: true }))
    assert.equal(out.outcome.criteria[0]?.status, 'no-difference')
    assert.deepEqual(ids(out.routes), ['a', 'b'])
  })

  it('does not treat a non-finite duration as comparable', () => {
    const routes = [base('a', 0, Number.NaN), base('b', 1, 2500)]
    const out = applyPreferences(routes, 'FOUR_WHEELER', prefs({ fastest: true }))
    assert.deepEqual(ids(out.routes), ['a', 'b'])
    assert.equal(out.outcome.criteria[0]?.status, 'unavailable')
  })
})

describe('avoided modes (filtering)', () => {
  it('avoiding the mode that was searched leaves no journey, honestly', () => {
    const routes = [bus('a', 0, 3000), bus('b', 1, 2500)]
    const out = applyPreferences(routes, 'BUS', prefs({}, ['BUS']))
    assert.equal(out.routes.length, 0)
    assert.equal(out.outcome.noMatch, true)
    assert.equal(out.outcome.hiddenCount, 2)
    assert.match(describeHidden(out.outcome) ?? '', /all 2 routes use Bus, which you are avoiding/)
  })

  it('never keeps a route that still has an avoided bus segment', () => {
    const routes = [bus('a', 0, 3000), bus('b', 1, 2500)]
    for (const mode of ['METRO', 'TRAIN', 'WALKING'] as const) {
      assert.deepEqual(ids(applyPreferences(routes, 'BUS', prefs({}, [mode])).routes), ['a', 'b'], mode)
    }
  })

  it('removes a metro journey that contains an identified bus leg, and keeps the others', () => {
    const withBus: Route = {
      ...metro('a', 0, 3000),
      metro: metroJourney({ segments: [...metroJourney().segments, { ...metroJourney().segments[1]!, type: 'TRANSIT', line: { lineId: null, name: '534', shortName: '534', color: null, vehicleType: 'BUS' } }] }),
    }
    const plain = metro('b', 1, 3200)
    const out = applyPreferences([withBus, plain], 'METRO', prefs({}, ['BUS']))
    assert.deepEqual(ids(out.routes), ['b'])
    assert.equal(out.outcome.hiddenCount, 1)
    assert.deepEqual(out.outcome.hiddenModes, ['BUS'])
    assert.match(describeHidden(out.outcome) ?? '', /1 route is hidden because it uses Bus/)
  })

  it('identifies transit steps by vehicle and does not guess about unknown ones', () => {
    const transit = (vehicleType: string): Route => ({
      ...base(vehicleType, 0, 1000),
      transit: { transfers: 0, departureTime: null, arrivalTime: null, steps: [{ kind: 'ride', lineName: 'x', vehicleType, departureStop: '', arrivalStop: '', departureTime: null, arrivalTime: null, headsign: '', stopCount: 1, distanceMeters: 1, durationSeconds: 1 }] },
    })
    assert.deepEqual([...modesOfRoute(transit('BUS'), 'TRAIN').modes].sort(), ['BUS', 'TRAIN'])
    assert.deepEqual([...modesOfRoute(transit('SUBWAY'), 'TRAIN').modes].sort(), ['METRO', 'TRAIN'])
    assert.equal(modesOfRoute(transit('TRAM'), 'TRAIN').unidentifiedLegs, 0)
    assert.equal(modesOfRoute(transit('MYSTERY'), 'TRAIN').unidentifiedLegs, 1)
    assert.equal(vehicleMode('heavy_rail'), 'TRAIN')
    const out = applyPreferences([transit('MYSTERY')], 'TRAIN', prefs({}, ['BUS']))
    assert.equal(out.routes.length, 1, 'an unidentified leg never removes a route')
    assert.equal(out.outcome.unverifiedRoutes, 1)
  })

  it('filtering and ranking are separate: avoiding removes, ranking only orders what is left', () => {
    const a = { ...bus('a', 0, 3000, { transfers: 2 }) }
    const out = applyPreferences([a, bus('b', 1, 2500, { transfers: 0 })], 'BUS', prefs({ fastest: true }, ['METRO']))
    assert.equal(out.outcome.hiddenCount, 0)
    assert.deepEqual(ids(out.routes), ['b', 'a'])
  })

  it('walking at the start or end of a transit journey is not the Walking mode', () => {
    assert.deepEqual(ids(applyPreferences([metro('a', 0, 3000)], 'METRO', prefs({}, ['WALKING'])).routes), ['a'])
  })
})

describe('summary and storage', () => {
  it('summarizes plainly', () => {
    assert.equal(summarizePreferences(DEFAULT_PREFERENCES), 'Default order')
    assert.equal(summarizePreferences(prefs({ fastest: true, fewerTransfers: true }, ['TRAIN', 'BUS'])), 'Fastest, Fewer transfers · Avoiding Train, Bus')
  })

  it('round-trips and reads defensively', () => {
    const chosen = prefs({ lessWalking: true, lowestFare: true }, ['TRAIN', 'BUS'])
    const back = parsePreferences(serializePreferences(chosen))
    assert.equal(back.status, 'ok')
    assert.deepEqual(back.preferences, { prefer: chosen.prefer, accessibility: DEFAULT_PREFERENCES.accessibility, avoid: ['TRAIN', 'BUS'] })
    for (const bad of ['{{', '[]', '"x"', JSON.stringify({ version: 2, prefer: {}, avoid: [] }), JSON.stringify({ version: 1, prefer: 'x', avoid: [] }), JSON.stringify({ version: 1, prefer: {} })]) {
      assert.equal(parsePreferences(bad).status, 'discarded', bad)
    }
    const messy = parsePreferences(JSON.stringify({ version: 1, prefer: { fastest: 'yes', lessWalking: true, extra: true }, avoid: ['BUS', 'BUS', 'HOVERCRAFT', 7, 'METRO'] }))
    assert.deepEqual(messy.preferences, { prefer: { fastest: false, lowestFare: false, fewerTransfers: false, lessWalking: true }, accessibility: DEFAULT_PREFERENCES.accessibility, avoid: ['METRO', 'BUS'] })
  })

  it('never throws on blocked storage, removes bad data, and stores nothing for the defaults', () => {
    const mem = (value: string | null): PreferencesBackend & { value: string | null } => ({ value, getItem() { return this.value }, setItem(_k: string, v: string) { this.value = v }, removeItem() { this.value = null } })
    const bad = mem('nope')
    assert.deepEqual(loadPreferences(bad), DEFAULT_PREFERENCES)
    assert.equal(bad.value, null)
    const store = mem(null)
    assert.equal(savePreferences(prefs({ fastest: true }), store), true)
    assert.equal(JSON.parse(store.value ?? '{}').version, 1)
    assert.equal(PREFERENCES_KEY, 'routeview.preferences')
    savePreferences(DEFAULT_PREFERENCES, store)
    assert.equal(store.value, null)
    const blocked: PreferencesBackend = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
    assert.deepEqual(loadPreferences(blocked), DEFAULT_PREFERENCES)
    assert.equal(savePreferences(prefs({ fastest: true }), blocked), false)
    assert.equal(savePreferences(prefs({ fastest: true }), null), false)
  })
})
