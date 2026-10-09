import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../api/ApiError.ts'
import { GoogleApiError, classifyFailure, describeFailure, toGoogleApiError } from './googleFailure.ts'
import { runWithPolicy, type RequestPolicy } from './requestPolicy.ts'

const noSleep = () => Promise.resolve()
const policy = (over: Partial<RequestPolicy> = {}): RequestPolicy => ({
  operation: 'routeCalculation',
  timeoutMs: 1_000,
  maxRetries: 1,
  retryDelayMs: 0,
  sleep: noSleep,
  ...over,
})
const api = (status: number, code?: string) => new ApiError(status, code ? { code } : null)

// The policy logs failures for developers; keep test output readable.
console.warn = () => undefined

describe('failure classification and messages', () => {
  it('maps backend answers to categories', () => {
    assert.equal(classifyFailure(api(0)), 'network')
    assert.equal(classifyFailure(api(400)), 'invalid-request')
    assert.equal(classifyFailure(api(503, 'ROUTING_UNAVAILABLE')), 'unavailable')
    assert.equal(classifyFailure(api(503, 'ROUTING_QUOTA')), 'quota')
    assert.equal(classifyFailure(api(503, 'ROUTING_NOT_CONFIGURED')), 'not-configured')
    assert.equal(classifyFailure(api(504, 'ROUTING_TIMEOUT')), 'timeout')
    assert.equal(classifyFailure(api(502, 'ROUTING_REJECTED')), 'rejected')
    assert.equal(classifyFailure(api(502, 'ROUTING_INVALID_RESPONSE')), 'invalid-response')
    assert.equal(classifyFailure(api(503)), 'unavailable', 'no code: by status')
    assert.equal(classifyFailure(api(429)), 'quota')
    assert.equal(classifyFailure(api(403)), 'rejected')
  })

  it('maps Maps JavaScript API failures by their text, without exposing it', () => {
    assert.equal(classifyFailure(new Error('RESOURCE_EXHAUSTED: quota')), 'quota')
    assert.equal(classifyFailure(new Error('REQUEST_DENIED')), 'rejected')
    assert.equal(classifyFailure(new Error('INVALID_ARGUMENT')), 'invalid-request')
    assert.equal(classifyFailure(new Error('Failed to fetch')), 'network')
    assert.equal(classifyFailure(new Error('UNAVAILABLE')), 'unavailable')
    assert.equal(classifyFailure(new Error('something odd')), 'unknown')
    assert.equal(classifyFailure(new SyntaxError('Unexpected token')), 'invalid-response')
  })

  it('shows understandable messages that never contain provider details', () => {
    assert.equal(describeFailure('network', 'routeCalculation'), 'Unable to connect. Check your internet connection and try again.')
    assert.equal(describeFailure('unavailable', 'routeCalculation'), 'The map service is temporarily unavailable. Please try again.')
    assert.equal(describeFailure('quota', 'routeCalculation'), 'The map service could not complete this request right now.')
    assert.equal(describeFailure('timeout', 'placeSuggestions'), 'The request took too long. Please try again.')
    assert.equal(describeFailure('unknown', 'placeSuggestions'), 'Unable to search locations. Try entering a different location.')
    const leaky = toGoogleApiError(new Error('API key AIza-SECRET denied at https://x?key=1'), 'routeCalculation')
    assert.doesNotMatch(leaky.message, /AIza|key|https|denied/i)
  })

  it('decides what can be retried or tried again', () => {
    assert.equal(new GoogleApiError('network', 'routeCalculation').retryable, true)
    assert.equal(new GoogleApiError('unavailable', 'routeCalculation').retryable, true)
    for (const kind of ['quota', 'rejected', 'timeout', 'invalid-request', 'not-configured', 'invalid-response', 'unknown'] as const) {
      assert.equal(new GoogleApiError(kind, 'routeCalculation').retryable, false, kind)
    }
    assert.equal(new GoogleApiError('invalid-request', 'routeCalculation').canTryAgain, false)
    assert.equal(new GoogleApiError('quota', 'routeCalculation').canTryAgain, true)
  })
})

describe('request policy', () => {
  it('returns the result of a healthy request without retrying', async () => {
    let calls = 0
    assert.equal(await runWithPolicy(async () => (calls += 1), policy()), 1)
    assert.equal(calls, 1)
  })

  it('retries a network failure once, then succeeds', async () => {
    let calls = 0
    const result = await runWithPolicy(async () => {
      calls += 1
      if (calls === 1) throw api(0)
      return 'ok'
    }, policy())
    assert.equal(result, 'ok')
    assert.equal(calls, 2)
  })

  it('gives up after the maximum number of retries with a safe, classified error', async () => {
    let calls = 0
    await assert.rejects(
      runWithPolicy(async () => {
        calls += 1
        throw api(503, 'ROUTING_UNAVAILABLE')
      }, policy({ maxRetries: 2 })),
      (error: unknown) => error instanceof GoogleApiError && error.kind === 'unavailable' && error.status === 503,
    )
    assert.equal(calls, 3, 'one attempt plus two retries, never more')
  })

  it('never retries quota, permission, invalid input, not-configured or malformed answers', async () => {
    for (const failure of [api(503, 'ROUTING_QUOTA'), api(403), api(400), api(503, 'ROUTING_NOT_CONFIGURED'), new SyntaxError('x')]) {
      let calls = 0
      await assert.rejects(
        runWithPolicy(async () => {
          calls += 1
          throw failure
        }, policy({ maxRetries: 3 })),
        GoogleApiError,
      )
      assert.equal(calls, 1)
    }
  })

  it('times out a request that never answers, without retrying a timeout', async () => {
    let calls = 0
    await assert.rejects(
      runWithPolicy(() => {
        calls += 1
        return new Promise(() => undefined)
      }, policy({ timeoutMs: 20 })),
      (error: unknown) => error instanceof GoogleApiError && error.kind === 'timeout' && /too long/.test(error.message),
    )
    assert.equal(calls, 1)
  })

  it('gives every attempt its own signal and aborts the one that timed out', async () => {
    let seen: AbortSignal | undefined
    await assert.rejects(runWithPolicy((signal) => ((seen = signal), new Promise(() => undefined)), policy({ timeoutMs: 10 })))
    assert.equal(seen?.aborted, true)
  })

  it('a cancelled request rejects with an AbortError even if the work finishes later', async () => {
    const controller = new AbortController()
    let finish: (value: string) => void = () => undefined
    const pending = runWithPolicy(() => new Promise<string>((resolve) => (finish = resolve)), policy({ signal: controller.signal }))
    controller.abort()
    finish('late answer')
    await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === 'AbortError')
  })

  it('a cancelled request does not start its retry', async () => {
    const controller = new AbortController()
    let calls = 0
    const pending = runWithPolicy(
      async () => {
        calls += 1
        controller.abort()
        throw api(0)
      },
      policy({ signal: controller.signal }),
    )
    await assert.rejects(pending, (error: unknown) => error instanceof DOMException)
    assert.equal(calls, 1)
  })

  it('stale autocomplete: only the answer of the latest request is applied', async () => {
    // Mirrors useLocationSuggestions: each new text cancels the previous request before it can be applied.
    const applied: string[] = []
    const run = (text: string, delay: number, signal: AbortSignal) =>
      runWithPolicy(() => new Promise<string>((resolve) => setTimeout(() => resolve(text), delay)), policy({ signal })).then((value) => {
        if (!signal.aborted) applied.push(value)
      })
    const a = new AbortController()
    const first = run('Far', 40, a.signal).catch(() => undefined)
    a.abort()
    const b = new AbortController()
    const second = run('Faridabad', 5, b.signal)
    await Promise.all([first, second])
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.deepEqual(applied, ['Faridabad'])
  })

  it('empty or short input is the caller’s concern: nothing is requested without a run function', async () => {
    let calls = 0
    const search = (text: string) => (text.trim().length < 3 ? Promise.resolve([]) : runWithPolicy(async () => (calls += 1, ['x']), policy()))
    assert.deepEqual(await search(''), [])
    assert.deepEqual(await search('Fa'), [])
    assert.equal(calls, 0)
  })
})
