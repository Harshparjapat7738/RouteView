import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import './app/global.css'
import './app/touch.css'
import { registerServiceWorker } from './app/registerServiceWorker.ts'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
