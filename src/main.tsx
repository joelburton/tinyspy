import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './common/theme.css'
import App from './App.tsx'
import { trackLayoutWidth } from './common/lib/layoutWidth'

// Publish `--client-width` (usable viewport width, scrollbar excluded) for the
// board-sizing math (see the helper's docstring + PlayArea.module.css `--avail-w`).
trackLayoutWidth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
