import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AudienceWindowView } from './presentation/AudienceWindowView.tsx'

const isAudienceWindow = new URLSearchParams(window.location.search).get('audience') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAudienceWindow ? <AudienceWindowView /> : <App />}
  </StrictMode>,
)
