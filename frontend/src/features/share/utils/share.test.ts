import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rawBusJourney } from '../../bus/utils/busFixture.ts'
import { parseBusJourney } from '../../bus/utils/parseBus.ts'
import { journey as metroJourney } from '../../metro/utils/metroFixture.ts'
import type { LocationSelection } from '../../location/types/location.ts'
import type { Route } from '../../route/types/route.ts'
import { copyText, shareNatively, type ShareEnvironment } from './shareAction.ts'
import { buildShareLink, parseShareLink, withoutShareParams } from './shareLink.ts'
import { buildShareSummary, DEFAULT_SHARE_POLICY, shareableOriginId, transitDetailLines } from './shareSummary.ts'

const BASE = 'https://app.example/'
const ORIGIN = 'ChIJoriginAAAAAAAAAA'
const DEST = 'ChIJdestinationBBBBBB'

const place = (name: string, placeId?: string): LocationSelection => ({ name, latitude: 28.61, longitude: 77.2, ...(placeId ? { placeId } : {}) })
const current: LocationSelection = { name: 'Current location', latitude: 28.123456, longitude: 77.654321, origin: 'CURRENT_LOCATION' }
const base = (): Route => ({ id: 'r', index: 0, distanceMeters: 1234, durationSeconds: 999, summary: 'via NH19', encodedPolyline: 'SECRETPOLYLINE', path: [], detectedAreas: [] })
const busRoute = (): Route => ({ ...base(), bus: parseBusJourney(rawBusJourney()) })
const metroRoute = (): Route => ({ ...base(), metro: metroJourney({ fare: { currency: 'INR', amount: '40' } }) })

describe('share link', () => {
  it('carries only a version, the mode and Place IDs', () => {
    const link = buildShareLink(`${BASE}?stale=1#x`, { travelMode: 'METRO', originPlaceId: ORIGIN, destinationPlaceId: DEST })
    assert.equal(link, `https://app.example/?rv=1&m=METRO&o=${ORIGIN}&d=${DEST}`)
    assert.deepEqual(parseShareLink(new URL(link!).search), { kind: 'ok', share: { travelMode: 'METRO', originPlaceId: ORIGIN, destinationPlaceId: DEST } })
  })

  it('leaves the origin out when there is none', () => {
    const link = buildShareLink(BASE, { travelMode: 'BUS', originPlaceId: null, destinationPlaceId: DEST })!
    assert.ok(!link.includes('o='))
    assert.deepEqual(parseShareLink(new URL(link).search), { kind: 'ok', share: { travelMode: 'BUS', originPlaceId: null, destinationPlaceId: DEST } })
  })

  it('refuses to build a link from anything that is not a Place ID or a mode', () => {
    assert.equal(buildShareLink(BASE, { travelMode: 'METRO', destinationPlaceId: '28.6,77.2' }), null)
    assert.equal(buildShareLink(BASE, { travelMode: 'METRO', destinationPlaceId: DEST, originPlaceId: 'a b' }), null)
    assert.equal(buildShareLink(BASE, { travelMode: 'JETPACK' as never, destinationPlaceId: DEST }), null)
    assert.equal(buildShareLink('not a url', { travelMode: 'METRO', destinationPlaceId: DEST }), null)
  })

  it('treats a query without the share version as no link at all', () => {
    assert.deepEqual(parseShareLink(''), { kind: 'none' })
    assert.deepEqual(parseShareLink('?utm_source=x'), { kind: 'none' })
    assert.deepEqual(parseShareLink(`?m=METRO&d=${DEST}`), { kind: 'none' })
  })

  it('rejects invalid links', () => {
    const bad = [
      `?rv=2&m=METRO&d=${DEST}`, // unknown version
      `?rv=1&m=JETPACK&d=${DEST}`, // unknown mode
      `?rv=1&m=metro&d=${DEST}`, // case matters
      `?rv=1&m=METRO`, // no destination
      `?rv=1&m=METRO&d=`, // empty destination
      `?rv=1&m=METRO&d=a%20b`, // not a Place ID
      `?rv=1&m=METRO&d=<script>`,
      `?rv=1&m=METRO&d=${DEST}&o=`, // empty origin
      `?rv=1&m=METRO&d=${DEST}&o=28.6,77.2`, // coordinates are not a Place ID
      `?rv=1&m=METRO&d=${DEST}&d=${ORIGIN}`, // duplicate
      `?rv=1&rv=1&m=METRO&d=${DEST}`,
      `?rv=1&m=METRO&d=${'x'.repeat(2000)}`, // too long
    ]
    for (const search of bad) assert.deepEqual(parseShareLink(search), { kind: 'invalid' }, search)
  })

  it('ignores parameters it does not own', () => {
    const parsed = parseShareLink(`?foo=bar&rv=1&m=WALKING&d=${DEST}&lat=1&lng=2`)
    assert.deepEqual(parsed, { kind: 'ok', share: { travelMode: 'WALKING', originPlaceId: null, destinationPlaceId: DEST } })
  })

  it('removes only its own parameters from the address', () => {
    assert.equal(withoutShareParams('/app', `?rv=1&m=METRO&d=${DEST}&o=${ORIGIN}&keep=1`, '#h'), '/app?keep=1#h')
    assert.equal(withoutShareParams('/', `?rv=1&m=METRO&d=${DEST}`, ''), '/')
  })
})

describe('share summary', () => {
  const link = `https://app.example/?rv=1&m=BUS&d=${DEST}`

  it('names the places and the mode, never figures that are recalculated', () => {
    const text = buildShareSummary({ start: place('Connaught Place', ORIGIN), destination: place('India Gate', DEST), travelMode: 'FOUR_WHEELER', route: base(), includeLocationDerived: false, link })
    assert.match(text, /From: Connaught Place/)
    assert.match(text, /To: India Gate/)
    assert.match(text, /Travel mode: Four Wheeler/)
    assert.match(text, /calculated again/)
    assert.ok(text.endsWith(link))
    for (const secret of ['SECRETPOLYLINE', '1234', '999', 'NH19']) assert.ok(!text.includes(secret), secret)
  })

  it('shares bus route numbers and transfers, and no stop names by default', () => {
    const route = busRoute()
    const lines = transitDetailLines({ start: place('A', ORIGIN), travelMode: 'BUS', route, includeLocationDerived: false })
    assert.ok(lines[0]!.startsWith('Bus: '))
    assert.ok(lines.length === 2)
    const stopNames = route.bus!.stops.map((stop) => stop.name)
    const text = buildShareSummary({ start: place('A', ORIGIN), destination: place('B', DEST), travelMode: 'BUS', route, includeLocationDerived: false, link: null })
    for (const name of stopNames) assert.ok(!text.includes(name), name)
  })

  it('shares bus stop names only when the dataset policy allows it', () => {
    const route = busRoute()
    const lines = transitDetailLines({ start: place('A', ORIGIN), travelMode: 'BUS', route, includeLocationDerived: false, policy: { bus: { routeNames: true, stopNames: true } } })
    assert.ok(lines.some((line) => line.startsWith('Stops: ')))
    assert.deepEqual(transitDetailLines({ start: place('A', ORIGIN), travelMode: 'BUS', route, includeLocationDerived: false, policy: { bus: { routeNames: false, stopNames: true } } }), [])
    assert.equal(DEFAULT_SHARE_POLICY.bus.stopNames, false)
  })

  it('never shares Google-derived metro content: lines, stations, fare or times', () => {
    const route = metroRoute()
    const text = buildShareSummary({ start: place('A', ORIGIN), destination: place('B', DEST), travelMode: 'METRO', route, includeLocationDerived: true, link: null })
    assert.deepEqual(transitDetailLines({ start: place('A', ORIGIN), travelMode: 'METRO', route, includeLocationDerived: true }), [])
    for (const segment of route.metro!.segments) {
      if (segment.line) assert.ok(!text.includes(segment.line.name), segment.line.name)
      if (segment.boarding) assert.ok(!text.includes(segment.boarding.name))
    }
    assert.ok(!text.includes('₹') && !text.includes('INR'))
  })

  it('omits the current location and anything derived from it unless the person agreed', () => {
    const route = busRoute()
    const input = { start: current, destination: place('B', DEST), travelMode: 'BUS' as const, route, link: null }
    const safe = buildShareSummary({ ...input, includeLocationDerived: false })
    assert.match(safe, /Current location \(position not shared\)/)
    assert.ok(!safe.includes('Bus:'))
    const agreed = buildShareSummary({ ...input, includeLocationDerived: true })
    assert.ok(agreed.includes('Bus:'))
    for (const text of [safe, agreed]) {
      assert.ok(!text.includes('28.123') && !text.includes('77.654'))
    }
  })

  it('never offers the device position as a link origin', () => {
    assert.equal(shareableOriginId(current), null)
    assert.equal(shareableOriginId(place('A', ORIGIN)), ORIGIN)
    assert.equal(shareableOriginId(place('No id')), null)
    assert.equal(shareableOriginId(null), null)
  })

  it('flattens control characters and newlines in names', () => {
    const text = buildShareSummary({ start: null, destination: place('Evil\nTo: Fake\u0007', DEST), travelMode: 'WALKING', route: null, includeLocationDerived: false, link: null })
    assert.ok(!text.includes('\nTo: Fake'))
    assert.match(text, /To: Evil To: Fake/)
  })
})

describe('native sharing and copy', () => {
  const payload = { title: 't', text: 'x', url: 'https://app.example/' }

  it('uses the Web Share API where it exists', async () => {
    const seen: unknown[] = []
    const env: ShareEnvironment = { share: async (data) => void seen.push(data), canShare: () => true }
    assert.equal(await shareNatively(payload, env), 'shared')
    assert.deepEqual(seen, [payload])
  })

  it('reports an unsupported environment so the copy actions are offered', async () => {
    assert.equal(await shareNatively(payload, {}), 'unsupported')
    assert.equal(await shareNatively(payload, { share: async () => {}, canShare: () => false }), 'unsupported')
    assert.equal(await shareNatively(payload, { share: async () => {}, canShare: () => { throw new Error('x') } }), 'unsupported')
  })

  it('treats closing the share sheet as a quiet cancel, and any other failure as a failure', async () => {
    assert.equal(await shareNatively(payload, { share: async () => { throw new DOMException('closed', 'AbortError') } }), 'cancelled')
    assert.equal(await shareNatively(payload, { share: async () => { throw new DOMException('no', 'NotAllowedError') } }), 'failed')
  })

  it('copies text, and reports a missing or refused clipboard', async () => {
    const copied: string[] = []
    assert.equal(await copyText('hello', { writeText: async (text) => void copied.push(text) }), 'copied')
    assert.deepEqual(copied, ['hello'])
    assert.equal(await copyText('hello', {}), 'failed')
    assert.equal(await copyText('hello', { writeText: async () => { throw new Error('denied') } }), 'failed')
  })
})
