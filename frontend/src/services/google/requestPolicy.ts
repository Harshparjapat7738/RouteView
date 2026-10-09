import { RequestTimeoutError, toGoogleApiError, type GoogleOperation } from './googleFailure.ts'
import { logGoogleFailure } from './logGoogleFailure.ts'

export interface RequestPolicy {
  operation: GoogleOperation
  /** Time limit of ONE attempt. */
  timeoutMs: number
  /** Extra attempts after the first, only for transient failures (network, temporary outage). Keep it at 0 or 1. */
  maxRetries: number
  /** Pause before a retry; grows with each retry. */
  retryDelayMs: number
  /** Cancels everything, including a pending retry. A cancelled request rejects with an AbortError, never a GoogleApiError. */
  signal?: AbortSignal
  /** Replaceable for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

let requestCounter = 0

/**
 * Runs one logical request with a time limit and a small, bounded retry for transient failures.
 *
 *  - every attempt gets its own AbortSignal and is abandoned when it exceeds `timeoutMs`;
 *  - only `network` and `unavailable` failures are retried, at most `maxRetries` times;
 *    quota, permission, invalid-input and timeout failures are never retried automatically;
 *  - failures are rethrown as `GoogleApiError` (safe message, `kind`); the technical details go to the
 *    developer log only. A cancelled request rethrows the AbortError untouched.
 */
export async function runWithPolicy<T>(run: (signal: AbortSignal) => Promise<T>, policy: RequestPolicy): Promise<T> {
  const { operation, timeoutMs, maxRetries, retryDelayMs, signal } = policy
  const sleep = policy.sleep ?? defaultSleep
  const requestId = `rv-${(++requestCounter).toString(36)}`

  for (let attempt = 1; ; attempt += 1) {
    throwIfAborted(signal)
    try {
      return await attemptOnce(run, timeoutMs, signal)
    } catch (error) {
      if (isAbort(error) && signal?.aborted) {
        throw error
      }
      const failure = toGoogleApiError(error instanceof DOMException && error.name === 'AbortError' ? new RequestTimeoutError() : error, operation)
      logGoogleFailure({ operation, kind: failure.kind, status: failure.status, code: failure.code, attempt, requestId })
      if (!failure.retryable || attempt > maxRetries) {
        throw failure
      }
      await sleep(retryDelayMs * attempt, signal)
    }
  }
}

async function attemptOnce<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  let rejectOnAbort: (reason: unknown) => void = () => undefined
  const onOuterAbort = () => {
    controller.abort()
    rejectOnAbort(new DOMException('Aborted', 'AbortError'))
  }
  outer?.addEventListener('abort', onOuterAbort)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      run(controller.signal),
      // A cancelled request stops waiting even when `run` itself cannot be cancelled (e.g. Maps JavaScript API calls).
      new Promise<never>((_, reject) => {
        rejectOnAbort = reject
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new RequestTimeoutError())
        }, timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onOuterAbort)
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
