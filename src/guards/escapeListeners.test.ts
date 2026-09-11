// cs-unmet

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GUARD: **only two places in the app listen for Escape globally.**
 *
 * Escape means "close this", and the app has two answers to "this". Floating
 * panels answer through `usePanelEscape`, one module-level listener that knows
 * what you are inside and what is on top. The transient overlays that are NOT
 * floating panels — a definition popover, a filter's dropdown, the phone info
 * sheet — answer through `useDismissOnEscape`, which stops the press before the
 * registry hears it. A third listener is a bug by construction.
 *
 * **The failure it exists for is silent and was live.** `DefinitionPopover`
 * bound its own `window` keydown, and the anagram finder mounts one: define a
 * word inside the dialog, press Escape, and the definition AND the finder both
 * closed, because two listeners each answered the same press. Nothing threw and
 * nothing looked wrong in either file.
 *
 * **And the fix cannot be eyeballed**, which is the real reason this is a test.
 * A hand-rolled listener calling `stopPropagation` on `window` does nothing at
 * all — the registry is a sibling on that same target, and same-target
 * listeners are not stopped by it. It has to be `document`, one step earlier in
 * the bubble. That distinction is invisible at a glance and fails silently when
 * wrong, so "remember to do it right" is not a mechanism.
 *
 * A component that HOLDS FOCUS needs neither hook: it handles the key on its
 * own element and stops it there, which is what `Menu` does. That never matches
 * this scan, because it is not a global listener.
 */

const SRC = join(process.cwd(), 'src')

/** Where an Escape listener is legitimate, and why. The list does not grow
 *  without a new ANSWER to "what does Escape close" — not a new caller. */
const ALLOWED = new Map<string, string>([
  [
    'src/common/floating-panels/usePanelEscape.ts',
    'the floating-panel registry: the one listener that ranks open panels',
  ],
  [
    'src/common/keyboard/useDismissOnEscape.ts',
    'the transient-overlay hook: dismisses one overlay and stops the press',
  ],
  [
    'src/common/keyboard/useBacktickEscape.ts',
    'translates a bare backtick INTO an Escape; it dismisses nothing itself',
  ],
  ['src/guards/escapeListeners.test.ts', 'this file names the shapes it looks for'],
])

/** Every `.ts` / `.tsx` file under `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(full) ? [full] : []
  })
}

const rel = (f: string) => f.replace(`${process.cwd()}/`, '')

describe('no raw Escape listener outside the two that own the key', () => {
  /** A global keydown binding in this file, and a test for Escape anywhere in
   *  it. Deliberately coarse: the pair is what a private handler looks like,
   *  and a false positive costs one allowlist line with a reason on it. */
  function bindsEscapeGlobally(file: string): boolean {
    const src = readFileSync(file, 'utf8')
    return (
      /(window|document)\.addEventListener\(\s*['"]keydown['"]/.test(src) &&
      /['"]Escape['"]/.test(src)
    )
  }
  const isTest = (f: string) => f.endsWith('.test.ts') || f.endsWith('.test.tsx')

  const suspects = sourceFiles(SRC)
    .filter((f) => !isTest(f) && bindsEscapeGlobally(f))
    .map(rel)
    .filter((f) => !ALLOWED.has(f))
    .sort()

  it('every global keydown handler that tests for Escape is one of the two', () => {
    expect(
      suspects,
      'A hand-rolled Escape listener. Escape has exactly two owners: ' +
        '`usePanelEscape` for floating panels, `useDismissOnEscape` for the ' +
        'transient overlays that are not panels. Use the hook — and note that ' +
        'rolling your own on `window` cannot work, because the registry is a ' +
        'sibling there and `stopPropagation` does not stop siblings.\n\n' +
        suspects.join('\n'),
    ).toEqual([])
  })

  it('the allowlist has no stale rows', () => {
    const all = new Set(sourceFiles(SRC).map(rel))
    const stale = [...ALLOWED.keys()].filter((f) => !all.has(f)).sort()
    expect(stale, `no longer exists; drop it from ALLOWED:\n${stale.join('\n')}`).toEqual([])
  })
})
