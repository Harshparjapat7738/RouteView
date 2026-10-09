import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  boardingStation, datasetAgeDays, describeDataset, describeInterchanges, describeMetroPath, describeStation, describeStations, describeStops, describeServicePeriod,
  exitStation, formatFare, isDatasetStale, lineLabel, metroRides, stationKey,
} from './metroFormat.ts'
import { blue, journey, station, yellow } from './metroFixture.ts'

describe('metro formatting', () => {
  it('formats a reported fare in rupees and never invents one', () => {
    assert.equal(formatFare({ currency: 'INR', amount: '40' }), '₹40')
    assert.equal(formatFare({ currency: 'USD', amount: '4.5' }), 'USD 4.5')
    assert.equal(formatFare(null), 'Fare unavailable')
  })

  it('describes interchanges and stations', () => {
    assert.equal(describeInterchanges(0), 'Direct')
    assert.equal(describeInterchanges(1), '1 interchange')
    assert.equal(describeInterchanges(2), '2 interchanges')
    assert.equal(describeStations(null), null)
    assert.equal(describeStations(1), '1 station')
    assert.equal(describeStations(7), '7 stations')
  })

  it('identifies a line by text, not colour alone', () => {
    assert.equal(lineLabel(blue), 'Blue Line')
    assert.equal(lineLabel({ ...blue, name: 'Line 3', shortName: 'L3' }), 'Line 3 (L3)')
    assert.equal(lineLabel({ ...blue, color: null }), 'Blue Line')
    assert.equal(lineLabel(null), 'Metro')
  })

  it('keys stations by dataset id, else by name and place', () => {
    assert.equal(stationKey(station('s-a', 'Alpha', 'BOARDING')), 's-a')
    assert.equal(stationKey(station(null, 'Alpha', 'BOARDING')), 'p:Alpha@28.6,77.2')
  })

  it('finds rides, boarding and exit', () => {
    const j = journey()
    assert.equal(metroRides(j).length, 2)
    assert.equal(boardingStation(j)?.name, 'Alpha')
    assert.equal(exitStation(j)?.name, 'Zulu')
    assert.equal(describeMetroPath(j), 'Alpha → Blue Line → Central → Yellow Line → Zulu')
  })

  it('describes a station for screen readers with its role and lines', () => {
    assert.equal(describeStation(station('c', 'Central', 'INTERCHANGE', [blue, yellow])), 'Central, interchange, Blue Line, Yellow Line')
    assert.equal(describeStation(station('z', 'Zulu', 'EXIT')), 'Zulu, exit station')
  })

  it('states the data source as static and flags old data', () => {
    const now = Date.parse('2026-10-09T00:00:00Z')
    const dataset = { source: 'DMRC GTFS', sourceVersion: '2023-08-10', sourceUpdatedAt: '2023-08-10', importedAt: null }
    assert.ok((datasetAgeDays(dataset, now) ?? 0) > 365)
    assert.equal(isDatasetStale(dataset, now), true)
    assert.match(describeDataset(dataset, now), /Static data, not real time\. This data may not include recent changes\./)
    const fresh = { ...dataset, sourceUpdatedAt: '2026-09-01' }
    assert.equal(isDatasetStale(fresh, now), false)
    assert.doesNotMatch(describeDataset(fresh, now), /recent changes/)
    assert.equal(isDatasetStale({ ...dataset, sourceUpdatedAt: null }, now), false)
    assert.match(describeDataset(null, now), /routing provider only/)
  })

  it('words stations listed and stops travelled separately (10 stations, 9 stops)', () => {
    assert.equal(describeStations(10), '10 stations')
    assert.equal(describeStops(9), '9 stops')
    assert.equal(describeStops(1), '1 stop')
    assert.equal(describeStops(0), null)
    assert.equal(describeStops(null), null)
    assert.equal(describeStops(undefined), null)
  })

  it('says when the dataset calendar has ended and never extends it', () => {
    const base = { source: 'DMRC GTFS', sourceVersion: 'v1', sourceUpdatedAt: null, importedAt: null }
    const now = Date.parse('2026-10-09T00:00:00Z')
    const ended = describeServicePeriod({ ...base, servicePeriodStart: '2019-01-01', servicePeriodEnd: '2025-12-31' }, now)
    assert.match(ended, /2019-01-01 to 2025-12-31/)
    assert.match(ended, /has ended/)
    const current = describeServicePeriod({ ...base, servicePeriodStart: '2026-01-01', servicePeriodEnd: '2026-12-31' }, now)
    assert.doesNotMatch(current, /has ended/)
    assert.equal(describeServicePeriod(base, now), '', 'no calendar: nothing is claimed')
    assert.match(describeDataset({ ...base, servicePeriodStart: '2019-01-01', servicePeriodEnd: '2025-12-31' }, now), /has ended/)
  })
})
