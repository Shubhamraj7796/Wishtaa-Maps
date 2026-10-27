import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import 'katex/dist/katex.min.css'
import './styles/tailwind.css'
import { App } from './app/App'
import { boot } from './app/boot'
import { ErrorBoundary } from './app/ErrorBoundary'

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
