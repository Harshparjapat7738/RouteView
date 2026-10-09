import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './MapControlButton.css'

interface MapControlButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** Required: the button only shows an icon. */
  label: string
  children: ReactNode
  /** Visual tone of the icon: `active` for an on state, `error` for a failed action. */
  tone?: 'default' | 'active' | 'error'
}

/**
 * The one shape every floating map control shares: a 44 px circular, elevated button with an icon.
 * Hover, pressed and focus states are defined once here.
 */
export const MapControlButton = forwardRef<HTMLButtonElement, MapControlButtonProps>(function MapControlButton(
  { label, children, tone = 'default', className, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      className={`map-control-button${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      data-tone={tone}
    >
      {children}
    </button>
  )
})
