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

describe('CSS custom-property tokens', () => {
  it('every var(--token) reference is defined (no phantom tokens)', () => {
    const cssFiles = walk(SRC, ['.css'])
    const codeFiles = walk(SRC, ['.tsx', '.ts']).filter((f) => !f.endsWith('.test.ts'))

    const defined = new Set<string>()
    // Declared in a stylesheet.
    for (const f of cssFiles)
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/(--[a-z0-9-]+)\s*:/g))
        defined.add(m[1])
    // Set inline from a component (quoted style key).
    for (const f of codeFiles)
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/['"](--[a-z0-9-]+)['"]/g))
        defined.add(m[1])

    // Every reference, with the file it appears in (for a useful failure).
    const refs = new Map<string, string>()
    for (const f of [...cssFiles, ...codeFiles])
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/var\(\s*(--[a-z0-9-]+)/g))
        if (!refs.has(m[1])) refs.set(m[1], f.replace(`${process.cwd()}/`, ''))

    const isDefined = (name: string) =>
      defined.has(name) ||
      // dynamic name like `var(--color-member-${x})` → captured as the
      // trailing-dash prefix; OK if any defined token extends it.
      (name.endsWith('-') && [...defined].some((d) => d.startsWith(name)))

    const phantom = [...refs.entries()]
      .filter(([name]) => !isDefined(name))
      .map(([name, file]) => `${name}  (first seen in ${file})`)

    expect(phantom, `Undefined CSS token(s) referenced via var():\n${phantom.join('\n')}`).toEqual(
      [],
    )
  })
})
