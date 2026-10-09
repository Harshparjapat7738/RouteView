import { useSyncExternalStore } from 'react'

/**
 * A pointer from the offline notice to the journeys saved for offline use. The page that owns the saved journeys publishes the
 * count and how to open them; the layout that shows the notice reads it. Nothing else is shared and nothing is stored here.
 */
export interface OfflineHint {
  count: number
  open: () => void
}

let current: OfflineHint | null = null
const listeners = new Set<() => void>()

export function setOfflineHint(hint: OfflineHint | null): void {
  current = hint
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useOfflineHint(): OfflineHint | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
