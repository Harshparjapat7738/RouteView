import type { ReactNode } from 'react'
import './MapStatusMessage.css'

interface MapStatusMessageProps {
  variant: 'loading' | 'error'
  children: ReactNode
  /** A recovery action chosen by the user, e.g. reloading the map. */
  action?: { label: string; onClick: () => void }
}

/** Full-area message shown in place of the map while it loads or when it cannot be shown. */
export function MapStatusMessage({ variant, children, action }: MapStatusMessageProps) {
  return (
    <div
      className={`map-status map-status--${variant}`}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      {variant === 'loading' && <span className="map-status__spinner" aria-hidden="true" />}
      <p>{children}</p>
      {action && (
        <button type="button" className="map-status__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
