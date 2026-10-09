/** A pin shown on the map. The map feature knows nothing about where markers come from. */
export interface MapMarker {
  id: string
  kind: 'start' | 'destination'
  position: { lat: number; lng: number }
  /** Human-readable place name, used as the marker tooltip. */
  label: string
}

/** A highlighted point on a route (for example where a selected area is reached). */
export interface MapHighlight {
  position: { lat: number; lng: number }
  label: string
}

/** A route line shown on the map. The map feature knows nothing about where routes come from. */
export interface MapRoute {
  id: string
  path: readonly { lat: number; lng: number }[]
  color: string
}

/** The user's position, shown as the current-location marker. `fixId` changes with each new fix. */
export interface MapCurrentLocation {
  fixId: number
  position: { lat: number; lng: number }
  accuracyMeters: number | null
}
