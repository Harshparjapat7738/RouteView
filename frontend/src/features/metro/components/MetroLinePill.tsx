import type { CSSProperties } from 'react'
import { NEUTRAL_LINE_COLOR } from '../utils/mapMetro.ts'
import './Metro.css'

/**
 * A metro line: a colour swatch plus the line's name in text, so the line is never identified by colour alone.
 * The colour is the dataset's own; a line without one gets a neutral swatch.
 */
export function MetroLinePill({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="metro-line" style={{ '--metro-line-color': color ?? NEUTRAL_LINE_COLOR } as CSSProperties}>
      <span className="metro-line__swatch" aria-hidden="true" />
      <span className="metro-line__name">{name}</span>
    </span>
  )
}
