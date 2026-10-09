import { GoogleMapsProvider } from '../features/map/components/GoogleMapsProvider.tsx'
import { AppLayout } from '../layouts/AppLayout.tsx'
import { HomePage } from '../pages/HomePage.tsx'

export function App() {
  return (
    <GoogleMapsProvider>
      <AppLayout>
        <HomePage />
      </AppLayout>
    </GoogleMapsProvider>
  )
}
