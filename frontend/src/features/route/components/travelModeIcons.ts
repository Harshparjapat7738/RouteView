import type { ReactElement, SVGProps } from 'react'
import { BicycleIcon, BusIcon, CarIcon, MetroIcon, MotorcycleIcon, TrainIcon, WalkIcon } from '../../../ui/Icons.tsx'
import type { TravelMode } from '../types/travelMode.ts'

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement

export const TRAVEL_MODE_ICONS: Readonly<Record<TravelMode, IconComponent>> = {
  TWO_WHEELER: MotorcycleIcon,
  FOUR_WHEELER: CarIcon,
  WALKING: WalkIcon,
  CYCLING: BicycleIcon,
  TRAIN: TrainIcon,
  METRO: MetroIcon,
  BUS: BusIcon,
}
