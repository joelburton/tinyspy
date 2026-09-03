// cs-blessed-deep

/** Top of the React application. */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './common/fixed.css'                 // colors themes don't change
import './common/base.css'                  // resets & non-color values
import './common/patterns/badge.css'        // CSS patterns
import './common/patterns/focus-ring.css'
import './common/patterns/heading.css'
import './common/patterns/page.css'
import './common/patterns/segmented.css'
import './common/utilities.css'             // tiny utilities: muted, etc

import App from './App.tsx'
import { loadTheme } from './common/themes/loadTheme'
import { trackLayoutWidth } from './common/lib/util/layoutWidth'
import { reloadOnStaleChunk } from './common/lib/util/reloadOnStaleChunk'
import { onUncaughtRender, showPanic } from './common/lib/util/panic'

// Publish `--client-width` (usable viewport width, scrollbar excluded) for the
// board-sizing math.
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
  // A throw during RENDER never reaches the catch below: React schedules the
  // render, catches what it throws, unmounts the whole tree, and calls this
  // instead. The play surface has the app's only boundary, so everything
  // outside it — a page, the shell — lands here, and the same last-resort
  // screen as boot's is painted (see `panic.ts`).
  createRoot(root, { onUncaughtError: onUncaughtRender }).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (err) {
  // The two steps above that can throw: the theme load and the #root lookup.
  // Nothing has rendered, and the stylesheet chain may be what failed, so the
  // screen paints itself rather than reaching for ErrorPage.
  showPanic('boot', err)
}
