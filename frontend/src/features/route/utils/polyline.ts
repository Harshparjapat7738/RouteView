import type { LatLng } from '../../../types/geo.ts'

const MAX_ENCODED_LENGTH = 2_000_000
const COORDINATE_SCALE = 1e5
const MAX_SHIFT = 30

/**
 * Decodes an encoded polyline (precision 5, see
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm).
 * The input comes from the network, so malformed data throws instead of producing garbage.
 */
export function decodePolyline(encoded: string): LatLng[] {
  if (encoded.length === 0 || encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error('Invalid polyline length')
  }

  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0

  function readDelta(): number {
    let result = 0
    let shift = 0
    let chunk: number
    do {
      if (index >= encoded.length || shift > MAX_SHIFT) {
        throw new Error('Malformed polyline')
      }
      chunk = encoded.charCodeAt(index++) - 63
      if (chunk < 0 || chunk > 63) {
        throw new Error('Malformed polyline')
      }
      result += (chunk & 0x1f) * 2 ** shift
      shift += 5
    } while (chunk >= 0x20)
    return result % 2 === 1 ? -(result + 1) / 2 : result / 2
  }

  while (index < encoded.length) {
    lat += readDelta()
    lng += readDelta()
    const point = { lat: lat / COORDINATE_SCALE, lng: lng / COORDINATE_SCALE }
    if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) {
      throw new Error('Polyline coordinate out of range')
    }
    points.push(point)
  }
  return points
}
