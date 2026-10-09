import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MetroNetwork } from '../types/metro.ts'
import { isJourneyLine, journeyLineIds, journeyStations, networkLines, networkStations, NEUTRAL_LINE_COLOR, visibleNetworkStation } from './mapMetro.ts'
import { indexNetwork, stationSequence } from './metroNetworkQueries.ts'
import { journey, station } from './metroFixture.ts'

const network: MetroNetwork = {
  dataset: { source: 'DMRC GTFS', sourceVersion: 'v1', sourceUpdatedAt: null, importedAt: null },
  geometry: 'STATION_SEQUENCE',
  stations: [
    { id: 'a', name: 'Alpha', latitude: 28.6, longitude: 77.2, lineIds: ['blue'], interchange: false },
    { id: 'c', name: 'Central', latitude: 28.61, longitude: 77.21, lineIds: ['blue', 'yellow'], interchange: true },
    { id: 'z', name: 'Zulu', latitude: 28.62, longitude: 77.22, lineIds: ['yellow'], interchange: false },
  ],
  lines: [
    { id: 'blue', name: 'Blue Line', shortName: 'B', color: '#0000FF', patterns: [{ pattern: 'p1', toward: 'Central', stationIds: ['a', 'c'] }] },
    { id: 'yellow', name: 'Yellow Line', shortName: 'Y', color: null, patterns: [{ pattern: 'p2', toward: 'Zulu', stationIds: ['c', 'z'] }, { pattern: 'p3', toward: null, stationIds: ['ghost'] }] },
  ],
}

describe('metro map view-models', () => {
  it('draws lines as ordered station connections with a neutral colour when none is given', () => {
    const lines = networkLines(network)
    assert.equal(lines[0]?.color, '#0000FF')
    assert.equal(lines[1]?.color, NEUTRAL_LINE_COLOR)
    assert.equal(lines[1]?.paths.length, 1, 'a pattern with fewer than two known stations is not drawn')
    assert.equal(lines[0]?.paths[0]?.length, 2)
  })

  it('exposes network stations with their lines', () => {
    const stations = networkStations(network)
    assert.deepEqual(stations.find((s) => s.key === 'c')?.lines.map((l) => l.label), ['Blue Line', 'Yellow Line'])
  })

  it('shows interchanges before ordinary stations while zooming in', () => {
    assert.equal(visibleNetworkStation({ interchange: true }, 10), false)
    assert.equal(visibleNetworkStation({ interchange: true }, 11), true)
    assert.equal(visibleNetworkStation({ interchange: false }, 12), false)
    assert.equal(visibleNetworkStation({ interchange: false }, 13), true)
  })

  it('turns a journey into station markers with roles, skipping stations without a position', () => {
    const j = journey()
    const withGap = { ...j, stations: [...j.stations, { ...station('s-x', 'Nowhere', 'INTERMEDIATE'), latitude: null, longitude: null }, j.stations[0]!] }
    const stations = journeyStations(withGap)
    assert.deepEqual(stations.map((s) => [s.name, s.role]), [['Alpha', 'boarding'], ['Bravo', 'journey'], ['Central', 'interchange'], ['Zulu', 'exit']])
    assert.deepEqual(journeyStations(undefined), [])
  })

  it('knows which dataset lines the journey rides', () => {
    assert.deepEqual([...journeyLineIds(journey())].sort(), ['l-blue', 'l-yellow'])
  })

  it('gives a station its place on each line and its neighbours', () => {
    const info = stationSequence(network, indexNetwork(network), 'c')
    assert.equal(info.length, 2)
    const blue = info.find((i) => i.line.id === 'blue')!
    assert.deepEqual([blue.position, blue.total, blue.previous, blue.next], [2, 2, 'Alpha', null])
    assert.deepEqual(stationSequence(network, indexNetwork(network), 'nope'), [])
  })

  it('draws the dataset shapes when a service has them and falls back to station connections otherwise', () => {
    const shaped: MetroNetwork = {
      ...network,
      geometry: 'GTFS_SHAPES',
      lines: [
        { ...network.lines[0]!, shapes: [[{ lat: 28.6, lng: 77.2 }, { lat: 28.605, lng: 77.203 }, { lat: 28.61, lng: 77.21 }]] },
        { ...network.lines[1]!, shapes: [[{ lat: 28.6, lng: 77.2 }]] },
      ],
    }
    const lines = networkLines(shaped)
    assert.equal(lines[0]?.paths[0]?.length, 3, 'the real alignment, not a straight line between the two stations')
    assert.equal(lines[1]?.paths.length, 1, 'a one-point shape is not a shape: the station connection is used')
    assert.equal(lines[1]?.paths[0]?.length, 2)
  })

  it('lists a logical line once at a station served by two services of it', () => {
    const blueMain = { id: 'm', name: 'Blue Line (Noida Main Line)', shortName: '3', color: '#0072BC', groupId: 'g-blue', groupName: 'Blue Line', branch: 'Noida Main Line', patterns: [] }
    const blueSpur = { ...blueMain, id: 'v', name: 'Blue Line (Vaishali Branch)', shortName: '4', branch: 'Vaishali Branch' }
    const yellow = { id: 'y', name: 'Yellow Line', shortName: '2', color: '#F7B32B', groupId: 'g-yellow', groupName: 'Yellow Line', branch: null, patterns: [] }
    const net: MetroNetwork = {
      dataset: null,
      geometry: 'GTFS_SHAPES',
      stations: [
        { id: 't', name: 'Trunk', latitude: 28.6, longitude: 77.2, lineIds: ['m', 'v'], groupIds: ['g-blue'], interchange: false },
        { id: 'x', name: 'Cross', latitude: 28.61, longitude: 77.21, lineIds: ['m', 'v', 'y'], groupIds: ['g-blue', 'g-yellow'], interchange: true },
      ],
      lines: [blueMain, blueSpur, yellow],
    }
    const stations = networkStations(net)
    assert.deepEqual(stations.find((s) => s.key === 't')?.lines.map((l) => l.label), ['Blue Line'])
    assert.equal(stations.find((s) => s.key === 't')?.interchange, false)
    assert.deepEqual(stations.find((s) => s.key === 'x')?.lines.map((l) => l.label), ['Blue Line', 'Yellow Line'])
  })

  it('keeps both services of a logical line emphasised when the journey rides it', () => {
    const j = journey()
    const blue = { ...j.segments[1]!, line: { ...j.segments[1]!.line!, lineId: null, groupId: 'g-blue' } }
    const ids = journeyLineIds({ ...j, segments: [blue] })
    assert.equal(isJourneyLine({ id: 'm', groupId: 'g-blue' }, ids), true)
    assert.equal(isJourneyLine({ id: 'v', groupId: 'g-blue' }, ids), true)
    assert.equal(isJourneyLine({ id: 'y', groupId: 'g-yellow' }, ids), false)
  })

  it('marks a journey station as an interchange from the dataset, not from how many lines the journey uses there', () => {
    const j = journey()
    const ride = { ...station('s-r', 'Rajiv', 'INTERMEDIATE', [j.segments[1]!.line!]), interchange: true }
    const plain = { ...station('s-p', 'Plain', 'INTERMEDIATE', [j.segments[1]!.line!, j.segments[3]!.line!]), interchange: false }
    const stations = journeyStations({ ...j, stations: [ride, plain] })
    assert.deepEqual(stations.map((s) => [s.name, s.interchange]), [['Rajiv', true], ['Plain', false]])
  })
})
