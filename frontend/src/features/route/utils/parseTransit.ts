import type { TransitDetails, TransitStep } from '../types/transit.ts'

const MAX_TRANSIT_STEPS = 60
const MAX_TEXT = 200

/** Transit details are an enhancement too: anything malformed is dropped, never the route. */
export function parseTransit(value: unknown): TransitDetails | undefined {
  if (!isRecord(value) || !Array.isArray(value.steps)) {
    return undefined
  }
  const steps: TransitStep[] = []
  for (const item of value.steps.slice(0, MAX_TRANSIT_STEPS)) {
    const step = parseTransitStep(item)
    if (step) {
      steps.push(step)
    }
  }
  if (steps.length === 0) {
    return undefined
  }
  const transfers = typeof value.transfers === 'number' && Number.isInteger(value.transfers) && value.transfers >= 0 ? value.transfers : 0
  return { steps, transfers, departureTime: text(value.departureTime), arrivalTime: text(value.arrivalTime) }
}

function parseTransitStep(value: unknown): TransitStep | null {
  if (!isRecord(value) || (value.kind !== 'WALK' && value.kind !== 'RIDE')) {
    return null
  }
  return {
    kind: value.kind === 'RIDE' ? 'ride' : 'walk',
    lineName: text(value.lineName) ?? '',
    vehicleType: text(value.vehicleType) ?? '',
    departureStop: text(value.departureStop) ?? '',
    arrivalStop: text(value.arrivalStop) ?? '',
    departureTime: text(value.departureTime),
    arrivalTime: text(value.arrivalTime),
    headsign: text(value.headsign) ?? '',
    stopCount: isNonNegativeNumber(value.stopCount) ? Math.floor(value.stopCount) : 0,
    distanceMeters: isNonNegativeNumber(value.distanceMeters) ? value.distanceMeters : 0,
    durationSeconds: isNonNegativeNumber(value.durationSeconds) ? value.durationSeconds : 0,
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, MAX_TEXT) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
