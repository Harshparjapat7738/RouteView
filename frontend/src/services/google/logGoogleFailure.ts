import type { FailureKind, GoogleOperation } from './googleFailure.ts'

interface FailureLog {
  operation: GoogleOperation
  kind: FailureKind
  status: number | null
  code: string | null
  attempt: number
  requestId: string
}

/**
 * Developer-facing record of a failed Google-backed request, for example
 * `[google] operation=routeCalculation kind=unavailable status=503 code=ROUTING_UNAVAILABLE attempt=1 requestId=rv-3`.
 * Only categories, status codes and our own ids are written: never API keys, coordinates, provider messages
 * or request/response bodies.
 */
export function logGoogleFailure(entry: FailureLog): void {
  console.warn(
    `[google] operation=${entry.operation} kind=${entry.kind} status=${entry.status ?? '-'} code=${entry.code ?? '-'} attempt=${entry.attempt} requestId=${entry.requestId}`,
  )
}
