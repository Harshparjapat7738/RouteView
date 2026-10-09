import { UNKNOWN_ACCESS, type Accessibility } from '../types/accessibility.ts'

const MAX_TEXT = 100

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed === '' ? null : trimmed.slice(0, MAX_TEXT)
}

/**
 * Reads the accessibility object of a station or stop from a backend response (untrusted input).
 * Only ACCESSIBLE and INACCESSIBLE are statements; anything else - missing, malformed, another word - is UNKNOWN.
 * A statement without a source is kept (the status is what the backend said) but its source stays unnamed.
 */
export function parseAccessibility(value: unknown): Accessibility {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return UNKNOWN_ACCESS
  const record = value as Record<string, unknown>
  if (record.status !== 'ACCESSIBLE' && record.status !== 'INACCESSIBLE') return UNKNOWN_ACCESS
  return { status: record.status, source: text(record.source), sourceVersion: text(record.sourceVersion) }
}
