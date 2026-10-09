import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { ChevronIcon } from './Icons.tsx'
import './BottomSheet.css'

export type SheetSnap = 'peek' | 'half' | 'full'
const SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full']
/** Vertical movement (px) that counts as a drag instead of a tap. */
const DRAG_THRESHOLD = 24

interface BottomSheetProps {
  snap: SheetSnap
  onSnapChange: (snap: SheetSnap) => void
  /** Accessible name of the region. */
  label: string
  children: ReactNode
}

/**
 * On a phone: a panel anchored to the bottom of the screen with three heights (peek, half, full) that the user
 * changes by tapping, dragging or using the arrow keys on the handle. The map keeps the rest of the screen.
 * On wider screens the sheet dissolves (CSS `display: contents`) and its children float as separate panels.
 */
export function BottomSheet({ snap, onSnapChange, label, children }: BottomSheetProps) {
  const drag = useRef<{ startY: number; moved: boolean } | null>(null)
  const index = SNAPS.indexOf(snap)

  function step(delta: number) {
    const next = SNAPS[Math.min(SNAPS.length - 1, Math.max(0, index + delta))]
    if (next !== undefined) onSnapChange(next)
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    drag.current = { startY: event.clientY, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current
    drag.current = null
    if (state === null) return
    const dy = event.clientY - state.startY
    if (Math.abs(dy) >= DRAG_THRESHOLD) {
      state.moved = true
      step(dy < 0 ? 1 : -1)
    }
    // A drag must not also fire the click that toggles the sheet.
    if (state.moved) suppressNextClick.current = true
  }
  const suppressNextClick = useRef(false)

  function onClick() {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      return
    }
    // A tap toggles between the two commonest heights; "full" is reached by dragging or the arrow keys.
    onSnapChange(snap === 'peek' ? 'half' : 'peek')
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      step(1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      step(-1)
    }
  }

  return (
    <section className="bottom-sheet" data-snap={snap} aria-label={label}>
      <button
        type="button"
        className="bottom-sheet__handle"
        aria-expanded={snap !== 'peek'}
        aria-label={snap === 'peek' ? 'Show details' : 'Hide details'}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <span className="bottom-sheet__grip" aria-hidden="true" />
        <ChevronIcon className="bottom-sheet__chevron" width={18} height={18} direction={snap === 'peek' ? 'up' : 'down'} />
      </button>
      <div className="bottom-sheet__body">{children}</div>
    </section>
  )
}
