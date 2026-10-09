/**
 * Pure camera maths for keeping content inside the part of the map that is not covered by RouteView panels.
 * Web Mercator, 256 px tiles: the same projection Google Maps uses, so no map object is needed.
 */
export interface LatLng {
  lat: number
  lng: number
}

/** Pixels of the map element that are covered (or reserved) on each side. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Size {
  width: number
  height: number
}

const TILE = 256
const MAX_LAT_SIN = 0.9999

function toWorld(point: LatLng, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom
  const sin = Math.min(Math.max(Math.sin((point.lat * Math.PI) / 180), -MAX_LAT_SIN), MAX_LAT_SIN)
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function fromWorld(x: number, y: number, zoom: number): LatLng {
  const scale = TILE * 2 ** zoom
  const n = Math.PI - (2 * Math.PI * y) / scale
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lng: (x / scale) * 360 - 180,
  }
}

/** The map must keep at least this many pixels free on both axes for a camera change to make sense. */
export const MIN_VISIBLE_PX = 120

/** Where a point lies on screen, relative to the map element's top-left corner. */
export function screenPosition(point: LatLng, center: LatLng, zoom: number, size: Size): { x: number; y: number } {
  const p = toWorld(point, zoom)
  const c = toWorld(center, zoom)
  return { x: p.x - c.x + size.width / 2, y: p.y - c.y + size.height / 2 }
}

/** True when every point is inside the uncovered area. Points within `slack` px outside still count as inside. */
export function allPointsVisible(points: readonly LatLng[], center: LatLng, zoom: number, size: Size, insets: Insets, slack = 0): boolean {
  return points.every((point) => {
    const { x, y } = screenPosition(point, center, zoom, size)
    return x >= insets.left - slack && x <= size.width - insets.right + slack && y >= insets.top - slack && y <= size.height - insets.bottom + slack
  })
}

/**
 * The map centre that places `point` in the middle of the uncovered area (not the middle of the whole element),
 * at the given zoom.
 */
export function centerForVisiblePoint(point: LatLng, zoom: number, insets: Insets): LatLng {
  const world = toWorld(point, zoom)
  const dx = (insets.left - insets.right) / 2
  const dy = (insets.top - insets.bottom) / 2
  return fromWorld(world.x - dx, world.y - dy, zoom)
}

/**
 * On a very small map element the panels can leave almost nothing free. Opposing insets are then scaled down
 * together so that at least MIN_VISIBLE_PX stays free on each axis (content may then pass partly under a panel,
 * which is better than not fitting at all). An element smaller than MIN_VISIBLE_PX gets no insets.
 */
export function clampInsets(size: Size, insets: Insets): Insets {
  const scaleAxis = (total: number, a: number, b: number): [number, number] => {
    const free = total - a - b
    if (free >= MIN_VISIBLE_PX) return [a, b]
    const room = Math.max(0, total - MIN_VISIBLE_PX)
    const factor = a + b === 0 ? 0 : room / (a + b)
    return [a * factor, b * factor]
  }
  const [top, bottom] = scaleAxis(size.height, insets.top, insets.bottom)
  const [left, right] = scaleAxis(size.width, insets.left, insets.right)
  return { top, right, bottom, left }
}
