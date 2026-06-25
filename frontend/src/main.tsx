import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { TickerProvider } from './TickerContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TickerProvider>
        <App />
      </TickerProvider>
    </BrowserRouter>
  </StrictMode>,
)
