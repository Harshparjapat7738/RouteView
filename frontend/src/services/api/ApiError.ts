import type { FieldValidationError, ProblemDetail } from '../../types/api.ts'

/** Error raised by the HTTP client for any non-successful API call. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly fieldErrors: readonly FieldValidationError[]

  constructor(status: number, problem: ProblemDetail | null) {
    super(problem?.detail || problem?.title || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = typeof problem?.code === 'string' ? problem.code.slice(0, 64) : null
    this.fieldErrors = problem?.errors ?? []
  }
}
