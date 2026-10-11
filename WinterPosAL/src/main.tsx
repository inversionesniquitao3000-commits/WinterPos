import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DialogProvider } from './hooks/useDialog.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DialogProvider>
      <ErrorBoundary moduleName="Aplicación Principal">
        <App />
      </ErrorBoundary>
    </DialogProvider>
  </StrictMode>,
)
