import type { ElementType, ReactNode } from 'react'
import './FloatingPanel.css'

interface FloatingPanelProps {
  /** The element to render; a `section` by default. */
  as?: ElementType
  className?: string
  children: ReactNode
  /** Passed through, e.g. `aria-label`. */
  [attribute: `aria-${string}`]: string | boolean | undefined
}

/** A rounded, softly elevated white surface that floats above the map. On a phone the bottom sheet flattens it. */
export function FloatingPanel({ as: Element = 'section', className, children, ...rest }: FloatingPanelProps) {
  return (
    <Element {...rest} data-map-overlay="" className={`floating-panel${className ? ` ${className}` : ''}`}>
      {children}
    </Element>
  )
}
