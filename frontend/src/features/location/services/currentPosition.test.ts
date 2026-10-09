import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CURRENT_POSITION_OPTIONS,
  CurrentPositionError,
  describeCurrentPositionError,
  requestCurrentPosition,
  type GeolocationLike,
} from './currentPosition.ts'
import { zoomForAccuracy } from '../../map/utils/currentLocationZoom.ts'

const succeed = (latitude: number, longitude: number, accuracy = 25): GeolocationLike => ({
  getCurrentPosition: (ok) => ok({ coords: { latitude, longitude, accuracy } } as GeolocationPosition),
})
const fail = (code: number): GeolocationLike => ({
  getCurrentPosition: (_ok, no) => no({ code, message: 'raw browser text that must never reach the user' } as GeolocationPositionError),
})

describe('requestCurrentPosition', () => {
  it('resolves one position with its accuracy', async () => {
    assert.deepEqual(await requestCurrentPosition(succeed(28.3354, 77.4231, 12)), {
      latitude: 28.3354,
      longitude: 77.4231,
      accuracyMeters: 12,
    })
  })

  it('maps browser error codes to RouteView kinds', async () => {
    for (const [code, kind] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout'], [99, 'unavailable']] as const) {
      await assert.rejects(requestCurrentPosition(fail(code)), (error: unknown) => error instanceof CurrentPositionError && error.kind === kind)
    }
  })

  it('reports unsupported when there is no geolocation or it throws', async () => {
    await assert.rejects(requestCurrentPosition(undefined, CURRENT_POSITION_OPTIONS), (e: unknown) => e instanceof CurrentPositionError && e.kind === 'unsupported')
    const throwing: GeolocationLike = { getCurrentPosition: () => { throw new Error('SecurityError') } }
    await assert.rejects(requestCurrentPosition(throwing), (e: unknown) => e instanceof CurrentPositionError && e.kind === 'unsupported')
  })

  it('rejects impossible coordinates instead of showing a marker', async () => {
    await assert.rejects(requestCurrentPosition(succeed(120, 10)), (e: unknown) => e instanceof CurrentPositionError && e.kind === 'unavailable')
    await assert.rejects(requestCurrentPosition(succeed(Number.NaN, 10)), CurrentPositionError)
  })

  it('asks once with sensible options (no watching, short cache)', async () => {
    let received: PositionOptions | undefined
    let calls = 0
    const spy: GeolocationLike = { getCurrentPosition: (ok, _no, options) => { calls++; received = options; ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } } as GeolocationPosition) } }
    await requestCurrentPosition(spy)
    assert.equal(calls, 1)
    assert.deepEqual(received, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 10_000 })
  })
})

/** Runs `body` with `globalThis.isSecureContext` set (or absent), then restores whatever was there. */
async function withSecureContext(value: boolean | undefined, body: () => Promise<void>): Promise<void> {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'isSecureContext')
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext')
  Object.defineProperty(globalThis, 'isSecureContext', { value, configurable: true, writable: true })
  try {
    await body()
  } finally {
    if (had && previous) {
      Object.defineProperty(globalThis, 'isSecureContext', previous)
    } else {
      delete (globalThis as { isSecureContext?: boolean }).isSecureContext
    }
  }
}

describe('secure context', () => {
  it('insecure page: never calls the Geolocation API and says the page must be secure', async () => {
    await withSecureContext(false, async () => {
      let calls = 0
      const spy: GeolocationLike = { getCurrentPosition: () => { calls++ } }
      await assert.rejects(requestCurrentPosition(spy), (e: unknown) => e instanceof CurrentPositionError && e.kind === 'insecure')
      assert.equal(calls, 0)
      const text = describeCurrentPositionError('insecure')
      assert.match(text, /HTTPS/)
      assert.match(text, /localhost/)
      assert.doesNotMatch(text, /settings|allow|permission/i)
    })
  })

  it('insecure page is reported even when the geolocation object is missing', async () => {
    await withSecureContext(false, async () => {
      await assert.rejects(requestCurrentPosition(undefined, CURRENT_POSITION_OPTIONS), (e: unknown) => e instanceof CurrentPositionError && e.kind === 'insecure')
    })
  })

  it('secure page + denied permission keeps the existing permission message', async () => {
    await withSecureContext(true, async () => {
      await assert.rejects(requestCurrentPosition(fail(1)), (e: unknown) => e instanceof CurrentPositionError && e.kind === 'denied')
      assert.equal(describeCurrentPositionError('denied'), 'Location access is blocked. Allow it in your browser settings to use your current location.')
    })
  })

  it('secure page + success returns the validated coordinates', async () => {
    await withSecureContext(true, async () => {
      assert.deepEqual(await requestCurrentPosition(succeed(28.5, 77.2, 30)), { latitude: 28.5, longitude: 77.2, accuracyMeters: 30 })
    })
  })

  it('secure page keeps unsupported, timeout and unavailable handling', async () => {
    await withSecureContext(true, async () => {
      await assert.rejects(requestCurrentPosition(undefined, CURRENT_POSITION_OPTIONS), (e: unknown) => e instanceof CurrentPositionError && e.kind === 'unsupported')
      await assert.rejects(requestCurrentPosition(fail(3)), (e: unknown) => e instanceof CurrentPositionError && e.kind === 'timeout')
      await assert.rejects(requestCurrentPosition(fail(2)), (e: unknown) => e instanceof CurrentPositionError && e.kind === 'unavailable')
    })
  })

  it('a browser that does not report isSecureContext is treated as before (the request goes ahead)', async () => {
    await withSecureContext(undefined, async () => {
      assert.equal((await requestCurrentPosition(succeed(1, 2))).latitude, 1)
    })
  })
})

describe('messages and zoom', () => {
  it('every failure has a short human sentence without technical words', () => {
    for (const kind of ['denied', 'unavailable', 'timeout', 'unsupported', 'insecure'] as const) {
      const text = describeCurrentPositionError(kind)
      assert.ok(text.length > 10 && text.length < 110)
      assert.doesNotMatch(text, /error|exception|code|PERMISSION|undefined/i)
    }
  })

  it('a coarse fix gets a wider view', () => {
    assert.equal(zoomForAccuracy(20), 15)
    assert.equal(zoomForAccuracy(null), 15)
    assert.equal(zoomForAccuracy(600), 14)
    assert.equal(zoomForAccuracy(3000), 12)
    assert.equal(zoomForAccuracy(50000), 10)
  })
})
