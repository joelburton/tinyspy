import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './common/theme.css'
import App from './App.tsx'
import { trackLayoutWidth } from './common/lib/util/layoutWidth'
import { reloadOnStaleChunk } from './common/lib/util/reloadOnStaleChunk'

// Publish `--client-width` (usable viewport width, scrollbar excluded) for the
// board-sizing math (see the helper's docstring + PlayArea.module.css `--avail-w`).
trackLayoutWidth()

// A tab that outlives a deploy references lazy chunks the new deploy deleted;
// reload once to pick up the current build (see the helper's docstring).
reloadOnStaleChunk()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
