/** Field-level validation error returned by the backend. */
export interface FieldValidationError {
  field: string
  message: string
}

/**
 * Error body returned by the backend for every failed request
 * (RFC 9457 "Problem Details for HTTP APIs").
 */
export interface ProblemDetail {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  /** Stable, non-sensitive failure code of some endpoints, e.g. ROUTING_QUOTA. */
  code?: string
  errors?: FieldValidationError[]
}
