import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import 'katex/dist/katex.min.css'
import './styles/tailwind.css'
import { startAuth } from './app/account'
import { App } from './app/App'
import { boot } from './app/boot'
import { installChunkRecovery } from './app/chunkRecovery'
import { ErrorBoundary } from './app/ErrorBoundary'
import { listenForInstall } from './pwa/install'
import { registerServiceWorker } from './pwa/register'

// Installable app: listen for the browser's install offer, and keep the app ready to open with no connection (production only).
listenForInstall()
registerServiceWorker()
// A tab left open across a deploy asks for files that no longer exist: recover once, by reloading the new version.
installChunkRecovery()
// Accounts (when this site has them set up): read the saved sign-in in the background; guests download nothing extra.
startAuth()

void boot()
  .catch(() => undefined) // a failed clean-up must never stop the app from opening
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    )
  })
