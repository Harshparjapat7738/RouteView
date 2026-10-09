import type { TransitDetails, TransitStep } from '../types/transit.ts'

const VEHICLE_LABELS: Readonly<Record<string, string>> = {
  SUBWAY: 'Metro',
  METRO_RAIL: 'Metro',
  MONORAIL: 'Monorail',
  HEAVY_RAIL: 'Train',
  COMMUTER_TRAIN: 'Train',
  HIGH_SPEED_TRAIN: 'Train',
  LONG_DISTANCE_TRAIN: 'Train',
  RAIL: 'Train',
  TRAIN: 'Train',
  LIGHT_RAIL: 'Light rail',
  TRAM: 'Tram',
  BUS: 'Bus',
  INTERCITY_BUS: 'Bus',
  TROLLEYBUS: 'Bus',
  SHARE_TAXI: 'Shared taxi',
  FERRY: 'Ferry',
  CABLE_CAR: 'Cable car',
  GONDOLA_LIFT: 'Gondola',
  FUNICULAR: 'Funicular',
}

/** A user-facing name for the provider's vehicle type; the type itself is shown (prettified) if it is unknown. */
export function vehicleLabel(vehicleType: string): string {
  if (vehicleType === '') {
    return 'Transit'
  }
  const known = VEHICLE_LABELS[vehicleType.toUpperCase()]
  if (known !== undefined) {
    return known
  }
  const words = vehicleType.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function rides(transit: TransitDetails): TransitStep[] {
  return transit.steps.filter((step) => step.kind === 'ride')
}

/** "Direct" or "2 transfers". */
export function describeTransfers(transfers: number): string {
  if (transfers <= 0) return 'Direct'
  return `${transfers} ${transfers === 1 ? 'transfer' : 'transfers'}`
}

/** "Station A → Violet Line → Station B": what the provider reported for the first and last ride. */
export function describeTransitPath(transit: TransitDetails): string {
  const ridden = rides(transit)
  if (ridden.length === 0) {
    return ''
  }
  const lines = ridden.map((step) => (step.lineName !== '' ? step.lineName : vehicleLabel(step.vehicleType)))
  const parts = [ridden[0]?.departureStop ?? '', ...lines, ridden[ridden.length - 1]?.arrivalStop ?? ''].filter((part) => part !== '')
  return parts.join(' → ')
}

/** Local clock time such as "09:41"; empty for a missing or invalid time. */
export function formatClock(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
