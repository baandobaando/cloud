import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { IS_DEMO } from './api'
import App from './App'
import { SessionProvider } from './state/Session'
import { ToastProvider } from './components/Toast'
import { DialogProvider } from './components/Dialog'
import './styles.css'

// The demo is a single hosted page, so it keeps routes in the URL hash.
const Router = IS_DEMO ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <ToastProvider>
        <DialogProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </DialogProvider>
      </ToastProvider>
    </Router>
  </StrictMode>,
)
