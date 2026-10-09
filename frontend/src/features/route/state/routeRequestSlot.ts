/** One route calculation in flight: the locations it is for and the controller that cancels it. */
export interface RouteRequest {
  readonly key: string
  readonly controller: AbortController
}

/**
 * Holds the single route request that is allowed to update the Route Session.
 *
 *  - `begin(key)` refuses (returns null) while a request for the same locations is pending, so repeated clicks
 *    never send duplicates; for other locations it cancels the old request and returns the new one;
 *  - `isCurrent(request)` is false for a request that was superseded, cancelled or finished, so its late
 *    response can never overwrite newer state;
 *  - `cancel()` cancels whatever is pending (locations changed, page closed) and says which key it was for.
 */
export function createRouteRequestSlot() {
  let current: RouteRequest | null = null

  return {
    begin(key: string): RouteRequest | null {
      if (current?.key === key) {
        return null
      }
      current?.controller.abort()
      current = { key, controller: new AbortController() }
      return current
    },
    isCurrent(request: RouteRequest): boolean {
      return current === request && !request.controller.signal.aborted
    },
    finish(request: RouteRequest): void {
      if (current === request) {
        current = null
      }
    },
    cancel(): string | null {
      const pending = current
      current = null
      pending?.controller.abort()
      return pending?.key ?? null
    },
    pendingKey(): string | null {
      return current?.key ?? null
    },
  }
}
