import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './common/theme.css'
import App from './App.tsx'
import { trackScrollbarWidth } from './common/lib/scrollbarWidth'

// Publish `--scrollbar-width` for the board-sizing math (see the helper's
// docstring + common/components/PlayArea.module.css `--avail-w`).
trackScrollbarWidth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
