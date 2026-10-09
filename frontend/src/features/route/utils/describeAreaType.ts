import type { AreaType } from '../types/detectedArea.ts'

const LABELS: Record<AreaType, string> = {
  VILLAGE: 'Village',
  LOCALITY: 'Locality',
  SUBURB: 'Suburb',
  SECTOR: 'Sector',
  TOWN: 'Town',
  CITY: 'City',
  MUNICIPALITY: 'Municipality',
  DISTRICT: 'District',
  OTHER: 'Area',
}

export function describeAreaType(type: AreaType): string {
  return LABELS[type]
}
