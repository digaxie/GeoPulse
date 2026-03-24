import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'ol/ol.css'
import './App.css'
import './index.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'

initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
