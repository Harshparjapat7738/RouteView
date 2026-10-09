import type { Insets, Size } from './viewportMath.ts'

/** Marks a RouteView panel that floats over the map; the camera keeps content clear of it. */
export const MAP_OVERLAY_ATTRIBUTE = 'data-map-overlay'

/** Breathing room kept between content and the edge of the uncovered area. */
const BASE_PADDING_PX = 32
/** Below this overlap a panel is treated as not covering the map. */
const MIN_OVERLAP_PX = 8
/** A panel at least this wide (relative to the map) is a top or bottom bar, otherwise a left or right column. */
const BAR_WIDTH_RATIO = 0.6

export function mapElementSize(element: HTMLElement): Size {
  return { width: element.clientWidth, height: element.clientHeight }
}

/**
 * How much of the map element is covered by RouteView panels right now, measured from the DOM so that the
 * camera follows whatever the CSS layout is (desktop columns, phone top bar). The bottom sheet does not appear
 * here: on phones the map element ends where the sheet begins. Includes a base padding on every side.
 */
export function readMapInsets(mapElement: HTMLElement): Insets {
  const map = mapElement.getBoundingClientRect()
  const insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  for (const element of document.querySelectorAll<HTMLElement>(`[${MAP_OVERLAY_ATTRIBUTE}]`)) {
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.display === 'contents') continue
    const box = element.getBoundingClientRect()
    const overlapX = Math.min(box.right, map.right) - Math.max(box.left, map.left)
    const overlapY = Math.min(box.bottom, map.bottom) - Math.max(box.top, map.top)
    if (overlapX < MIN_OVERLAP_PX || overlapY < MIN_OVERLAP_PX) continue
    if (box.width >= map.width * BAR_WIDTH_RATIO) {
      if (box.top + box.height / 2 < map.top + map.height / 2) {
        insets.top = Math.max(insets.top, box.bottom - map.top)
      } else {
        insets.bottom = Math.max(insets.bottom, map.bottom - box.top)
      }
    } else if (box.left + box.width / 2 < map.left + map.width / 2) {
      insets.left = Math.max(insets.left, box.right - map.left)
    } else {
      insets.right = Math.max(insets.right, map.right - box.left)
    }
  }
  return {
    top: insets.top + BASE_PADDING_PX,
    right: insets.right + BASE_PADDING_PX,
    bottom: insets.bottom + BASE_PADDING_PX,
    left: insets.left + BASE_PADDING_PX,
  }
}
