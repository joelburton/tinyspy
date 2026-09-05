// cs-blessed-deep

/** Top of the React application. */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './common/core-css/fixed.css'                 // colors themes don't change
import './common/core-css/base.css'                  // resets & non-color values
import './common/core-css/patterns/badge.css'        // CSS patterns
import './common/core-css/patterns/focus-ring.css'
import './common/core-css/patterns/heading.css'
import './common/core-css/patterns/page.css'
import './common/core-css/patterns/segmented.css'
import './common/core-css/utilities.css'             // tiny utilities: muted, etc

import App from './App.tsx'
import { loadTheme } from './common/themes/loadTheme'
import { trackLayoutWidth } from './common/mobile/layoutWidth'
import { reloadOnStaleChunk } from './common/boot/reloadOnStaleChunk'
import { onUncaughtRender, showPanic } from './common/boot/panic'

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
