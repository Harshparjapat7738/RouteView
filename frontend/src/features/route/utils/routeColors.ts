/** Distinguishable line colours for route alternatives; the same colour is used on the map and in the list. */
const ROUTE_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#0891b2', '#475569'] as const

export function routeColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length] ?? ROUTE_COLORS[0]
}
