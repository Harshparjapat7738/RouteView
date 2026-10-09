import { apiRequest } from '../../../services/api/httpClient.ts'
import { parseMetroNetwork } from '../utils/parseMetro.ts'
import type { MetroNetwork } from '../types/metro.ts'

/** The static Delhi Metro network (stations, lines, ordered stations of each line) from the backend. */
export async function fetchMetroNetwork(signal: AbortSignal): Promise<MetroNetwork> {
  const response = await apiRequest<unknown>('/metro/network', { signal })
  const network = parseMetroNetwork(response)
  if (network === null) {
    const error = new Error('Unexpected metro network response')
    error.name = 'RouteResponseError'
    throw error
  }
  return network
}
