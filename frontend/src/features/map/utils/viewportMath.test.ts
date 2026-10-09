import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { allPointsVisible, centerForVisiblePoint, clampInsets, MIN_VISIBLE_PX, screenPosition } from './viewportMath.ts'

const size = { width: 400, height: 600 }
const none = { top: 0, right: 0, bottom: 0, left: 0 }
const centre = { lat: 28.4, lng: 77.3 }

describe('viewportMath', () => {
  it('the map centre is the middle of the element', () => {
    const p = screenPosition(centre, centre, 12, size)
    assert.ok(Math.abs(p.x - 200) < 1e-6 && Math.abs(p.y - 300) < 1e-6)
  })

  it('a point east of the centre is to the right, a point north is up', () => {
    const east = screenPosition({ lat: 28.4, lng: 77.31 }, centre, 12, size)
    const north = screenPosition({ lat: 28.41, lng: 77.3 }, centre, 12, size)
    assert.ok(east.x > 200 && Math.abs(east.y - 300) < 1e-6)
    assert.ok(north.y < 300)
  })

  it('a point under a panel is not visible, the same point is visible without it', () => {
    const point = { lat: 28.4, lng: 77.2985 } // a little west of the centre at zoom 14: left of x=200
    assert.equal(allPointsVisible([point], centre, 14, size, none), true)
    assert.equal(allPointsVisible([point], centre, 14, size, { ...none, left: 300 }), false)
  })

  it('centring in the uncovered area moves the camera so the point sits in the middle of it', () => {
    const insets = { top: 100, right: 0, bottom: 0, left: 200 }
    const point = { lat: 28.45, lng: 77.35 }
    const camera = centerForVisiblePoint(point, 13, insets)
    const p = screenPosition(point, camera, 13, size)
    assert.ok(Math.abs(p.x - (200 + (400 - 200) / 2)) < 1e-6)
    assert.ok(Math.abs(p.y - (100 + (600 - 100) / 2)) < 1e-6)
  })

  it('clamping leaves the insets alone when enough room remains', () => {
    const insets = { top: 100, right: 32, bottom: 32, left: 32 }
    assert.deepEqual(clampInsets(size, insets), insets)
  })

  it('clamping keeps at least the minimum free on a small element', () => {
    const small = { width: 320, height: 300 }
    const clamped = clampInsets(small, { top: 216, right: 32, bottom: 32, left: 32 })
    assert.ok(small.height - clamped.top - clamped.bottom >= MIN_VISIBLE_PX - 1e-6)
    assert.ok(clamped.top > clamped.bottom, 'the larger inset stays the larger one')
  })

  it('a map element smaller than the minimum gets no insets', () => {
    assert.deepEqual(clampInsets({ width: 320, height: 100 }, { top: 50, right: 0, bottom: 50, left: 0 }), { top: 0, right: 0, bottom: 0, left: 0 })
  })
})
