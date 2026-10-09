import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { AreaChip } from '../../../ui/AreaChip.tsx'
import { ChevronIcon, PlusIcon } from '../../../ui/Icons.tsx'
import type { SelectedArea } from '../types/areaSearch.ts'
import './PassingAreaDisclosure.css'

interface PassingAreaDisclosureProps {
  selected: readonly SelectedArea[]
  onRemove: (key: string) => void
  /** The passing-area search itself, shown while the control is expanded. */
  children: ReactNode
}

/**
 * "Add passing area": a compact expandable control. Collapsed it is one line plus the chosen areas as chips
 * (`Neharpar ×`); expanded it contains the passing-area search. The search itself is unchanged.
 */
export function PassingAreaDisclosure({ selected, onRemove, children }: PassingAreaDisclosureProps) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  return (
    <div className="passing-disclosure" data-open={open}>
      <button
        type="button"
        className="passing-disclosure__toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        data-passing-toggle=""
        onClick={() => setOpen((value) => !value)}
      >
        <PlusIcon width={18} height={18} />
        <span className="passing-disclosure__text">{selected.length > 0 ? 'Passing areas' : 'Add passing area'}</span>
        <ChevronIcon className="passing-disclosure__chevron" width={18} height={18} direction={open ? 'up' : 'down'} />
      </button>
      {!open && selected.length > 0 && (
        <ul className="passing-disclosure__chips" aria-label="Selected areas">
          {selected.map((area) => (
            <AreaChip key={area.key} name={area.areaName} onRemove={() => onRemove(area.key)} />
          ))}
        </ul>
      )}
      <div id={bodyId} className="passing-disclosure__body" hidden={!open}>
        {children}
      </div>
    </div>
  )
}
