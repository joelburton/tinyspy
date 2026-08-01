import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: every `var(--token)` reference resolves to a token we actually
 * define somewhere.
 *
 * We own the entire CSS custom-property namespace, so a reference to an
 * undefined token is always a bug — a typo or a rename that didn't land
 * everywhere. The convention is therefore **no `var()` fallbacks**: a
 * fallback can only mask exactly this bug (and silently drift out of sync
 * with the real token), so we strip them and let this test be the safety
 * net instead. It's the build-time version of "paint missing tokens
 * obnoxious pink" — it fails CI before the bug can ship.
 *
 * A token counts as DEFINED if it's declared in any stylesheet (`--x:`)
 * or set inline from a component (a quoted `'--x'` style key in a .tsx —
 * e.g. the wordle reveal animation's `--reveal-bg`). Tokens whose names
 * are built dynamically (`var(--color-member-${name})`) are matched by
 * prefix.
 */

/**
 * The mirror guard below (`every defined token is referenced`) needs one
 * exception list, because a token can be deliberately defined ahead of its
 * first caller.
 *
 * **Vocabulary completeness.** `common/theme.css` lays the outcome colors out as
 * a GRID — each tier (won / lost / active / near / current / neutral) × each
 * role (`-bg` fill, `-border`, `-strong` legible-on-white) — and fills every
 * cell even where nothing consumes it yet. That's the point: a complete,
 * predictable grid tells the next contributor "there's already a color for
 * current / neutral — use it" instead of minting a new one. Same argument for
 * the `--tile-*` ramp's top border.
 *
 * This list IS that policy, made executable. A token here is a deliberate
 * vocabulary slot; a token that ISN'T here and has no `var()` reader is dead
 * code and this test says so. Adding a name here is a real decision — it means
 * "the vocabulary is incomplete without this," not "the test is annoying."
 */
const VOCABULARY_COMPLETENESS = new Set([
  '--color-outcome-active-strong',
  '--color-outcome-current-bg',
  '--color-outcome-current-strong',
  '--color-outcome-neutral-bg',
  '--color-outcome-neutral-strong',
  '--tile-4-border',
])

const SRC = join(process.cwd(), 'src')

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

// Strip comments so a token mentioned in prose (e.g. theme.css's own
// "reference them via var(--token-name)" doc) isn't read as a real ref.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const rel = (f: string) => f.replace(`${process.cwd()}/`, '')

/**
 * Parse the whole tree once: where each token is DEFINED, and where each is
 * REFERENCED. Both guards below read the same two maps from opposite ends —
 * that symmetry is the point, so a token can't be "defined" by one rule and
 * "referenced" by an incompatible one.
 */
function scanTokens() {
  const cssFiles = walk(SRC, ['.css'])
  const codeFiles = walk(SRC, ['.tsx', '.ts']).filter((f) => !f.endsWith('.test.ts'))

  // name → first file that defines it (for a useful failure message).
  const defined = new Map<string, string>()
  const define = (name: string, f: string) => {
    if (!defined.has(name)) defined.set(name, rel(f))
  }
  // Declared in a stylesheet.
  for (const f of cssFiles)
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/(--[a-z0-9-]+)\s*:/g))
      define(m[1], f)
  // Set inline from a component (quoted style key).
  for (const f of codeFiles)
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/['"](--[a-z0-9-]+)['"]/g))
      define(m[1], f)

  // name → first file that reads it via var().
  const refs = new Map<string, string>()
  for (const f of [...cssFiles, ...codeFiles])
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/var\(\s*(--[a-z0-9-]+)/g))
      if (!refs.has(m[1])) refs.set(m[1], rel(f))

  return { defined, refs }
}

describe('CSS custom-property tokens', () => {
  it('every var(--token) reference is defined (no phantom tokens)', () => {
    const { defined, refs } = scanTokens()

    const isDefined = (name: string) =>
      defined.has(name) ||
      // dynamic name like `var(--color-member-${x})` → captured as the
      // trailing-dash prefix; OK if any defined token extends it.
      (name.endsWith('-') && [...defined.keys()].some((d) => d.startsWith(name)))

    const phantom = [...refs.entries()]
      .filter(([name]) => !isDefined(name))
      .map(([name, file]) => `${name}  (first seen in ${file})`)

    expect(phantom, `Undefined CSS token(s) referenced via var():\n${phantom.join('\n')}`).toEqual(
      [],
    )
  })

  /**
   * The MIRROR of the guard above, and the one that catches the bug the other
   * can't see: a token defined and then never read. It costs nothing at runtime
   * (an unused custom property just sits there), which is exactly why these rot
   * silently — a 2026-07-13 CSS audit hand-found four, three of them carrying
   * comments that described them as in use.
   *
   * Deliberate vocabulary slots go in VOCABULARY_COMPLETENESS above, and that
   * list is short on purpose. Anything else with no reader is dead: delete the
   * declaration AND whatever comment claims it's live.
   */
  it('every defined token is referenced (no dead tokens)', () => {
    const { defined, refs } = scanTokens()

    // A ref whose name was built dynamically (`var(--color-member-${x})`) is
    // captured as its trailing-dash prefix, so it vouches for every token that
    // extends it — the same rule the forward guard uses, read the other way.
    const dynamicPrefixes = [...refs.keys()].filter((r) => r.endsWith('-'))
    const isReferenced = (name: string) =>
      refs.has(name) || dynamicPrefixes.some((p) => name.startsWith(p))

    const dead = [...defined.entries()]
      .filter(([name]) => !isReferenced(name) && !VOCABULARY_COMPLETENESS.has(name))
      .map(([name, file]) => `${name}  (defined in ${file})`)

    expect(
      dead,
      `Defined but never read via var() — delete them, or add to VOCABULARY_COMPLETENESS if the ` +
        `slot is deliberate:\n${dead.join('\n')}`,
    ).toEqual([])
  })
})
