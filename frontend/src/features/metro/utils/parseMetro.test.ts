import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseMetroJourney, parseMetroNetwork } from './parseMetro.ts'
import { journey } from './metroFixture.ts'

describe('metro parsing', () => {
  it('accepts a well-formed journey and keeps the provider fare', () => {
    const parsed = parseMetroJourney(JSON.parse(JSON.stringify(journey())))
    assert.ok(parsed)
    assert.equal(parsed.fare?.amount, '40')
    assert.equal(parsed.segments.filter((s) => s.type === 'METRO').length, 2)
    assert.equal(parsed.transfers, 1)
  })

  it('has no fare when the provider reported none or a malformed one', () => {
    assert.equal(parseMetroJourney({ ...journey(), fare: null })?.fare, null)
    assert.equal(parseMetroJourney({ ...journey(), fare: { currency: 'inr', amount: '4o' } })?.fare, null)
  })

  it('rejects data that is not a metro journey', () => {
    assert.equal(parseMetroJourney(null), undefined)
    assert.equal(parseMetroJourney({ segments: 'x' }), undefined)
    assert.equal(parseMetroJourney({ ...journey(), segments: [{ type: 'WALK' }] }), undefined)
  })

  it('drops malformed colours instead of showing them', () => {
    const raw = JSON.parse(JSON.stringify(journey()))
    raw.segments[1].line.color = 'url(javascript:1)'
    const parsed = parseMetroJourney(raw)
    assert.equal(parsed?.segments[1]?.line?.color, null)
  })

  it('treats a network without a dataset as unavailable data', () => {
    const network = parseMetroNetwork({ dataset: null, stations: [], lines: [] })
    assert.equal(network?.dataset, null)
    assert.equal(network?.stations.length, 0)
  })

  it('reads the explicit station and stop counts and the new line / station identity fields', () => {
    const raw = JSON.parse(JSON.stringify(journey()))
    raw.stationCount = 10
    raw.travelledStops = 9
    raw.segments[1].line.groupId = '11111111-1111-1111-1111-111111111111'
    raw.segments[1].line.branch = 'Vaishali Branch'
    raw.stations[2].interchange = true
    const parsed = parseMetroJourney(raw)
    assert.equal(parsed?.stationCount, 10)
    assert.equal(parsed?.travelledStops, 9)
    assert.equal(parsed?.segments[1]?.line?.groupId, '11111111-1111-1111-1111-111111111111')
    assert.equal(parsed?.segments[1]?.line?.branch, 'Vaishali Branch')
    assert.equal(parsed?.stations[2]?.interchange, true)
    assert.equal(parseMetroJourney({ ...raw, travelledStops: -3 })?.travelledStops, null)
  })

  it('parses the dataset service period and drops malformed dates and weekdays', () => {
    const raw = JSON.parse(JSON.stringify(journey()))
    raw.dataset = { source: 'DMRC_GTFS', sourceVersion: 'v1', servicePeriodStart: '2019-01-01', servicePeriodEnd: 'soon', operatingDays: ['monday', 'funday', 'saturday'] }
    const dataset = parseMetroJourney(raw)?.dataset
    assert.equal(dataset?.servicePeriodStart, '2019-01-01')
    assert.equal(dataset?.servicePeriodEnd, null)
    assert.deepEqual(dataset?.operatingDays, ['monday', 'saturday'])
  })

  it('parses network shapes as [lat, lng] paths, dropping invalid points', () => {
    const id = (n: number) => `${String(n).repeat(8)}-1111-1111-1111-111111111111`
    const network = parseMetroNetwork({
      dataset: null,
      geometry: 'GTFS_SHAPES',
      stations: [],
      lines: [{
        id: id(1), name: 'Blue Line (Vaishali Branch)', groupId: id(2), groupName: 'Blue Line', branch: 'Vaishali Branch', patterns: [],
        shapes: [{ id: 's1', points: [[28.6, 77.2], [28.61, 77.21], [999, 77.3], ['x', 1]] }, { id: 's2', points: [[28.6, 77.2]] }],
      }],
    })
    assert.equal(network?.geometry, 'GTFS_SHAPES')
    const line = network?.lines[0]
    assert.equal(line?.groupName, 'Blue Line')
    assert.equal(line?.shapes?.length, 1, 'a one-point shape is dropped')
    assert.deepEqual(line?.shapes?.[0], [{ lat: 28.6, lng: 77.2 }, { lat: 28.61, lng: 77.21 }])
  })
})
