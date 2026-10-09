import type { ReactNode } from 'react'
import { useOfflineHint } from '../app/offlineHint.ts'
import { useOnlineStatus } from '../app/useOnlineStatus.ts'
import './AppLayout.css'

interface AppLayoutProps {
  children: ReactNode
}

/** Full-screen shell: the map owns the screen; the offline notice floats above it. */
export function AppLayout({ children }: AppLayoutProps) {
  const online = useOnlineStatus()
  const hint = useOfflineHint()
  return (
    <div className="app-layout" data-offline={!online} data-offline-hint={!online && hint !== null}>
      {!online && (
        <div className="app-layout__offline" role="status">
          <strong>You're offline.</strong> Route calculation requires an internet connection.
          {hint !== null && (
            <button type="button" className="app-layout__offline-open" data-offline-banner="" onClick={hint.open}>
              {hint.count} saved {hint.count === 1 ? 'journey is' : 'journeys are'} available offline. View
            </button>
          )}
        </div>
      )}
      <main className="app-layout__main">{children}</main>
    </div>
  )
}
