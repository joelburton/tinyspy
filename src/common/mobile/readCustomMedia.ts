// cs-met-mobile

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * What `breakpoints.css` defines for one `@custom-media` name —
 * `readCustomMedia('--mobile')` → `'(max-width: 56.25rem)'`. Written for the
 * device-hook specs, which assert their query strings against it.
 *
 * Those conditions exist twice on purpose: matchMedia takes a condition and
 * cannot resolve a custom-media name, so `useIsMobile`, `useIsPhone` and
 * `useIsCoarsePointer` each spell theirs out again in JS. That second copy is the
 * one thing in this folder a refactor can falsify silently — tune a threshold in
 * the CSS, miss the hook, and the layout folds at one width while the JS branch
 * flips at another, with nothing red to say so. Comparing the two is what the
 * specs are for.
 *
 * Reads the stylesheet off disk rather than importing it: `@custom-media` is
 * resolved by a PostCSS step (postcss.config.js) and emits no CSS, so nothing
 * about these names reaches the module graph. Test-only — it uses `node:fs`.
 */
export function readCustomMedia(name: string): string {
  // From the repo root, like the guards under src/guards: vitest transforms this
  // module, so its `import.meta.url` is an http URL and can't locate a sibling.
  const css = readFileSync(join(process.cwd(), 'src/common/mobile/breakpoints.css'), 'utf8')
  const declaration = css.match(new RegExp(`^@custom-media\\s+${name}\\s+(.+);\\s*$`, 'm'))
  if (!declaration) throw new Error(`breakpoints.css declares no ${name}`)
  // Runs of whitespace collapse, so a wrap or a re-indent on either side isn't a
  // difference; everything else must match character for character.
  return declaration[1].replace(/\s+/g, ' ').trim()
}
