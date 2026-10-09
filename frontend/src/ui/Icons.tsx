import type { SVGProps } from 'react'

/** Small inline icon set (no icon library). All icons are decorative: the control that holds them carries the label. */
function Svg(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props} />
}

export const SearchIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
)

export const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
)

export const SwapIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M8 4v16M8 4 4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5" />
  </Svg>
)

export const ChevronIcon = ({ direction = 'down', ...props }: SVGProps<SVGSVGElement> & { direction?: 'up' | 'down' | 'left' | 'right' }) => (
  <Svg {...props} style={{ transform: `rotate(${{ down: 0, left: 90, up: 180, right: -90 }[direction]}deg)` }}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)

export const ArrowLeftIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
)

export const RouteIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
  </Svg>
)

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)

/** Start of a trip: a ring. */
export const StartDotIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="5" strokeWidth="3" />
  </Svg>
)

/** Destination: a map pin. */
export const PinIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props} fill="currentColor" stroke="none">
    <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
  </Svg>
)

/** The target / crosshair used by the Current Location button. */
export function LocateIcon({ filled = false }: { filled?: boolean }) {
  return (
    <Svg width={24} height={24}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2.6" fill={filled ? 'currentColor' : 'none'} />
      <path d="M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5" />
    </Svg>
  )
}

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

/** Travel-mode icons (same inline, decorative style as the rest of the set). */
export const MotorcycleIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <circle cx="5.5" cy="16.5" r="3" />
    <circle cx="18.5" cy="16.5" r="3" />
    <path d="M5.5 16.5 9 10h5l4.5 6.5M14 10l-1.5-3H10M9 10l3.5 6.5" />
  </Svg>
)

export const CarIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M4 16v-4l2-5h12l2 5v4M4 16h16M4 16v2.5M20 16v2.5M4 12h16" />
    <circle cx="7.5" cy="14" r="0.6" fill="currentColor" />
    <circle cx="16.5" cy="14" r="0.6" fill="currentColor" />
  </Svg>
)

export const WalkIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <circle cx="13" cy="4.5" r="1.8" />
    <path d="m11 21 1.5-6-2.5-2.5 1-5 3 1.5 2.5 2.5M9 10.5 7 13M12.5 15l2.5 2 1 4" />
  </Svg>
)

export const BicycleIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <circle cx="5.5" cy="16" r="3.5" />
    <circle cx="18.5" cy="16" r="3.5" />
    <path d="M5.5 16 9 8h5l4.5 8M9 8 12 16M14 8l-1-2.5h2.5M12 16 14 8" />
  </Svg>
)

export const TrainIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <rect x="6" y="3" width="12" height="14" rx="3" />
    <path d="M6 11h12M9 20l-2 2M15 20l2 2M9 20h6" />
    <circle cx="9.5" cy="14" r="0.7" fill="currentColor" />
    <circle cx="14.5" cy="14" r="0.7" fill="currentColor" />
  </Svg>
)

export const BusIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <rect x="4" y="3" width="16" height="15" rx="3" />
    <path d="M4 11h16M7 18v2M17 18v2" />
    <circle cx="8" cy="14.5" r="0.8" fill="currentColor" />
    <circle cx="16" cy="14.5" r="0.8" fill="currentColor" />
  </Svg>
)

export const MetroIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <rect x="5" y="3" width="14" height="14" rx="4" />
    <path d="M5 11h14M8 7h8M9 20l-2 2M15 20l2 2M9 20h6" />
    <circle cx="9" cy="14" r="0.7" fill="currentColor" />
    <circle cx="15" cy="14" r="0.7" fill="currentColor" />
  </Svg>
)

export const HomeIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="m4 11 8-7 8 7" />
    <path d="M6 10v9h12v-9" />
    <path d="M10 19v-5h4v5" />
  </Svg>
)

export const WorkIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
    <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 13h17" />
  </Svg>
)

export const StarIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4L12 16.1 7.2 18.8l1-5.4-4-3.7 5.4-.7Z" />
  </Svg>
)

export const HistoryIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5" />
    <path d="M4 4v4.5h4.5M12 8v4.2l2.8 1.8" />
  </Svg>
)

export const TrashIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5" />
  </Svg>
)

export const EditIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M5 19v-3.5L15.5 5 19 8.5 8.5 19Z" />
    <path d="m13.5 7 3.5 3.5" />
  </Svg>
)

export const RepeatIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M5 11V9.5A2.5 2.5 0 0 1 7.5 7H18l-2.5-2.5M19 13v1.5a2.5 2.5 0 0 1-2.5 2.5H6l2.5 2.5" />
  </Svg>
)

export const SlidersIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
)

export const ShareIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="17.5" cy="6" r="2.5" />
    <circle cx="17.5" cy="18" r="2.5" />
    <path d="m8.2 10.8 7.1-3.6M8.2 13.2l7.1 3.6" />
  </Svg>
)
