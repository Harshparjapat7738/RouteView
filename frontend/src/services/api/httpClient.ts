import { env } from '../../config/env.ts'
import type { ProblemDetail } from '../../types/api.ts'
import { ApiError } from './ApiError.ts'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  signal?: AbortSignal
}

const NETWORK_ERROR_STATUS = 0

/**
 * Centralised JSON client for the RouteView backend.
 * Paths are relative to the API base URL, e.g. `apiRequest('/routes')`.
 *
 * Responses are untrusted input: callers must validate or narrow the parsed
 * data before relying on its shape.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: 'same-origin',
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ApiError(NETWORK_ERROR_STATUS, { title: 'Unable to reach the server' })
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readProblemDetail(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function readProblemDetail(response: Response): Promise<ProblemDetail | null> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('json')) {
    return null
  }
  try {
    const parsed: unknown = await response.json()
    return isProblemDetail(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isProblemDetail(value: unknown): value is ProblemDetail {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
