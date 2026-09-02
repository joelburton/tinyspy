// cs-blessed-deep

/** Top of React application.*/

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
import { diagnosticsLine } from './common/lib/supabase/dbLog'

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
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (err) {
  showBootPanic(err);
}

function showBootPanic(err: unknown): void {
  // Nothing has rendered and the stylesheet chain may be what failed, so this
  // paints itself rather than reaching for ErrorPage.
  const detail = err instanceof Error ? `${ err.name }: ${ err.message }` : String(err);
  const line = diagnosticsLine("FAULT", {
    call: "boot",
    severity: "fault",
    detail,
  });
  console.error(line);

  const box = document.createElement("div");
  box.setAttribute("style", "max-width:32rem;margin:4rem auto;padding:0 1rem;font:14px system-ui,sans-serif");
  const sentence = document.createElement("p");
  sentence.textContent = "The app could not start. Reloading may fix it.";
  const diagnostics = document.createElement("p");
  diagnostics.setAttribute("style", "color:#666;font-size:0.85em;word-break:break-word");
  diagnostics.textContent = line;
  box.append(sentence, diagnostics);
  document.body.append(box);
}
