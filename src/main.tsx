import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
/* The stylesheet chain, in load order, and the order is the design.
 *
 *   themes/light-mode.css   what is true of every LIGHT theme
 *   themes/daylight.css     the role → hex grid for this theme
 *   fixed.css               colors no theme gets to touch
 *   base.css                element resets + every non-color value
 *   utilities.css           the global classes
 *
 * A theme declares its chain and something imports it — the base is
 * never an unconditional default. Put daylight on a bare `:root` and
 * any role a future midnight forgets resolves silently to a light hex
 * on a dark page, which is worse than an undefined token because it
 * resolves to something plausible.
 *
 * All of it is EAGER and global. A game's own brand anchors ship in
 * that game's lazy chunk, which is why crosswords/SetupForm.tsx has to
 * import its own — an undefined custom property invalidates the whole
 * declaration, silently. See plans/css-system-2.md §9. */
import './common/themes/light-mode.css'
import './common/themes/daylight.css'
import './common/fixed.css'
import './common/base.css'
import './common/utilities.css'
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
