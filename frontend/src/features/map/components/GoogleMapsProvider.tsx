import { APIProvider } from '@vis.gl/react-google-maps'
import type { ReactNode } from 'react'
import { env } from '../../../config/env.ts'
import { mapConfig } from '../config/mapConfig.ts'

interface GoogleMapsProviderProps {
  children: ReactNode
}

/**
 * The only place that loads the Google Maps JavaScript API. Everything that needs
 * Google (map, place search) must render inside it. Without an API key it renders
 * its children unchanged; consumers check `env.isGoogleMapsConfigured` first.
 */
export function GoogleMapsProvider({ children }: GoogleMapsProviderProps) {
  if (!env.isGoogleMapsConfigured) {
    return <>{children}</>
  }
  return <APIProvider apiKey={mapConfig.apiKey}>{children}</APIProvider>
}
