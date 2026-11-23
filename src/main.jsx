import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import RecoveryGuard from './components/RecoveryGuard.jsx'

if (import.meta.env.DEV) {
  const { initDevDemoMode } = await import('./utils/devDemoMode.js');
  initDevDemoMode();
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RecoveryGuard>
      <App />
    </RecoveryGuard>
  </StrictMode>,
)
