import { CloseIcon } from './Icons.tsx'
import './AreaChip.css'

interface AreaChipProps {
  name: string
  /** Called when the chip's remove button is pressed. */
  onRemove: () => void
}

/** A selected area as a compact removable chip: `Neharpar ×`. Renders an `li`; place it in a `ul`. */
export function AreaChip({ name, onRemove }: AreaChipProps) {
  return (
    <li className="area-chip area-search__chip">
      <span className="area-chip__name area-search__chip-name">{name}</span>
      <button type="button" className="area-chip__remove area-search__chip-remove" aria-label={`Remove ${name}`} onClick={onRemove}>
        <CloseIcon width={14} height={14} />
      </button>
    </li>
  )
}
