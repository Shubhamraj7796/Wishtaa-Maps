import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import 'katex/dist/katex.min.css'
import './styles/tailwind.css'
import { App } from './app/App'
import { ErrorBoundary } from './app/ErrorBoundary'
import { initSession } from './editor/session'

void initSession().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
})
