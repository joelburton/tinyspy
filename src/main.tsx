// cs-met-deep

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
/* The stylesheet chain, in two halves.
 *
 * THEME-INDEPENDENT, imported here and identical under every theme:
 *
 *   fixed.css       colors no theme gets to touch (member + wordle)
 *   base.css        element resets + every non-color value, incl. depth
 *   patterns/*.css  one named pattern per file — badge, button, list, page, …
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
 * something plausible. See plans/app-audit.md §3.
 *
 * All of it is EAGER and global. A game's own brand anchors ship in
 * that game's lazy chunk, which is why crosswords/SetupForm.tsx has to
 * import its own — an undefined custom property invalidates the whole
 * declaration, silently. See plans/app-audit.md §9. */
import './common/fixed.css'
import './common/base.css'
import './common/patterns/badge.css'
import './common/patterns/focus-ring.css'
import './common/patterns/heading.css'
import './common/patterns/page.css'
import './common/patterns/segmented.css'
import './common/utilities.css'
import App from './App.tsx'
import { loadTheme } from './common/themes/loadTheme'
import { trackLayoutWidth } from './common/lib/util/layoutWidth'
import { reloadOnStaleChunk } from './common/lib/util/reloadOnStaleChunk'
import { diagnosticsLine } from './common/lib/supabase/dbLog'

// Publish `--client-width` (usable viewport width, scrollbar excluded) for the
// board-sizing math (see the helper's docstring + PlayArea.module.css `--avail-w`).
trackLayoutWidth()

// A tab that outlives a deploy references lazy chunks the new deploy deleted;
// reload once to pick up the current build (see the helper's docstring).
// Registered BEFORE the await below, which is itself a dynamic import.
reloadOnStaleChunk()

try {
  // AWAITED before the first render: the theme's stylesheet arrives a tick after
  // the module graph (it is a dynamic import, which is what lets it be a choice),
  // and rendering ahead of it would paint one frame with every token undefined.
  await loadTheme()

  const root = document.getElementById('root')
  if (!root) throw new Error('no #root element')
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (err) {
  // Nothing has rendered and the stylesheet chain may be what failed, so this
  // paints itself rather than reaching for ErrorPage.
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  const line = diagnosticsLine('FAULT', { call: 'boot', severity: 'fault', detail })
  console.error(line)

  const box = document.createElement('div')
  box.setAttribute('style', 'max-width:32rem;margin:4rem auto;padding:0 1rem;font:14px system-ui,sans-serif')
  const sentence = document.createElement('p')
  sentence.textContent = 'The app could not start. Reloading may fix it.'
  const diagnostics = document.createElement('p')
  diagnostics.setAttribute('style', 'color:#666;font-size:0.85em;word-break:break-word')
  diagnostics.textContent = line
  box.append(sentence, diagnostics)
  document.body.append(box)
}
