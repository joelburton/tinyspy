import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
/* The stylesheet chain, in two halves.
 *
 * THEME-INDEPENDENT, imported here and identical under every theme:
 *
 *   fixed.css       colors no theme gets to touch (member + wordle)
 *   base.css        element resets + every non-color value, incl. depth
 *   patterns/*.css  one named pattern per file — button, list
 *   utilities.css   the adjustments that name nothing: muted, error
 *
 * THEME-DEPENDENT, chosen at startup by loadTheme():
 *
 *   themes/light-mode.css + themes/daylight.css     (daylight)
 *   themes/dark-mode.css  + themes/midnight.css     (midnight, a spike)
 *
 * A theme declares its chain and loadTheme imports it — the base is
 * never an unconditional default. Put daylight on a bare `:root` and
 * any role midnight forgets resolves silently to a light hex on a dark
 * page, which is worse than an undefined token because it resolves to
 * something plausible. See plans/css-system-2.md §3.
 *
 * All of it is EAGER and global. A game's own brand anchors ship in
 * that game's lazy chunk, which is why crosswords/SetupForm.tsx has to
 * import its own — an undefined custom property invalidates the whole
 * declaration, silently. See plans/css-system-2.md §9. */
import './common/fixed.css'
import './common/base.css'
import './common/patterns/button.css'
import './common/patterns/list.css'
import './common/utilities.css'
import App from './App.tsx'
import { loadTheme } from './common/themes/loadTheme'
import { trackLayoutWidth } from './common/lib/util/layoutWidth'
import { reloadOnStaleChunk } from './common/lib/util/reloadOnStaleChunk'

// Publish `--client-width` (usable viewport width, scrollbar excluded) for the
// board-sizing math (see the helper's docstring + PlayArea.module.css `--avail-w`).
trackLayoutWidth()

// A tab that outlives a deploy references lazy chunks the new deploy deleted;
// reload once to pick up the current build (see the helper's docstring).
reloadOnStaleChunk()

// AWAITED before the first render: the theme's stylesheet arrives a tick after
// the module graph (it is a dynamic import, which is what lets it be a choice),
// and rendering ahead of it would paint one frame with every token undefined.
await loadTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
