import { EMPTY_OFFLINE, OFFLINE_STORAGE_KEY, parseOffline, serializeOffline } from '../utils/offlineData.ts'
import type { OfflineData } from '../types/offline.ts'

/** The part of `Storage` this feature uses; tests pass a fake. */
export type OfflineBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type WriteFailure = 'UNAVAILABLE' | 'FULL' | 'FAILED'
export type WriteResult = { ok: true } | { ok: false; reason: WriteFailure }

export const WRITE_FAILURE_MESSAGES: Readonly<Record<WriteFailure, string>> = {
  UNAVAILABLE: 'This browser is not allowing RouteView to keep data on this device, so nothing was saved.',
  FULL: 'This device has no room left to keep it. Remove a saved journey or free up browser storage, then try again.',
  FAILED: 'The journey could not be saved safely, so nothing was changed. Please try again.',
}

function browserStorage(): OfflineBackend | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    // Blocked storage (private mode, policy) throws on access.
    return null
  }
}

function isQuota(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, code } = error as { name?: unknown; code?: unknown }
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014
}

export interface LoadResult {
  data: OfflineData
  /** Stored data was unreadable and has been removed. */
  discarded: boolean
  /** Records that could not be read and were left out. */
  dropped: number
}

/** Reads the saved journeys. Never throws: unreadable storage gives an empty list, and corrupt data is removed. */
export function loadOffline(now: number = Date.now(), backend: OfflineBackend | null = browserStorage()): LoadResult {
  if (backend === null) return { data: EMPTY_OFFLINE, discarded: false, dropped: 0 }
  try {
    const outcome = parseOffline(backend.getItem(OFFLINE_STORAGE_KEY), now)
    if (outcome.status === 'discarded') {
      try {
        backend.removeItem(OFFLINE_STORAGE_KEY)
      } catch {
        // Nothing more can be done; the next read discards it again.
      }
    }
    return { data: outcome.data, discarded: outcome.status === 'discarded', dropped: outcome.dropped }
  } catch {
    return { data: EMPTY_OFFLINE, discarded: false, dropped: 0 }
  }
}

/**
 * Writes the list in one step and reads it back. If the browser refused (full, blocked) or what was stored is not what was
 * written (an interrupted or altered write), the previous content is put back and the failure is reported: a save either
 * happened completely or not at all.
 */
export function saveOffline(data: OfflineData, backend: OfflineBackend | null = browserStorage()): WriteResult {
  if (backend === null) return { ok: false, reason: 'UNAVAILABLE' }
  let previous: string | null
  try {
    previous = backend.getItem(OFFLINE_STORAGE_KEY)
  } catch {
    return { ok: false, reason: 'UNAVAILABLE' }
  }
  try {
    if (data.journeys.length === 0) {
      backend.removeItem(OFFLINE_STORAGE_KEY)
      return backend.getItem(OFFLINE_STORAGE_KEY) === null ? { ok: true } : { ok: false, reason: 'FAILED' }
    }
    const text = serializeOffline(data)
    backend.setItem(OFFLINE_STORAGE_KEY, text)
    if (backend.getItem(OFFLINE_STORAGE_KEY) === text) return { ok: true }
    restore(backend, previous)
    return { ok: false, reason: 'FAILED' }
  } catch (error) {
    restore(backend, previous)
    return { ok: false, reason: isQuota(error) ? 'FULL' : 'FAILED' }
  }
}

function restore(backend: OfflineBackend, previous: string | null): void {
  try {
    if (previous === null) backend.removeItem(OFFLINE_STORAGE_KEY)
    else backend.setItem(OFFLINE_STORAGE_KEY, previous)
  } catch {
    // The previous content may already be gone; the next read treats whatever is there as untrusted.
  }
}

/** Deletes every saved journey from this device. */
export function clearOfflineStorage(backend: OfflineBackend | null = browserStorage()): WriteResult {
  return saveOffline(EMPTY_OFFLINE, backend)
}
