import './Bus.css'

/** A route number/name as a small label. The text is the identity shown to people; the route's own id is never displayed. */
export function BusRoutePill({ name }: { name: string }) {
  return (
    <span className="bus-pill" data-bus-route={name}>
      {name}
    </span>
  )
}
