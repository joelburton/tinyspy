// cs-unmet

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Guard: a converted game's exported types live in `types.ts` and start with
 * `G` (docs/code-conventions.md → A game's types).
 *
 * `types.ts` is the one place to read the data a game slings around, and the
 * `G` says a name is the game's and not the shell's. A type exported from a
 * `lib/` module or a hook is read by nobody looking for it, and a bare name in
 * `types.ts` cannot be told from a shared one without checking the import.
 *
 * **What is flagged**, per game on the converted list: an `export type` or
 * `export interface` anywhere but `types.ts` and `reactTypes.ts` (the types
 * that reach React, which an edge function cannot load), and one in either
 * whose name does not start with `G`. What the rule exempts, and this guard skips: the
 * printer's model in `pdf/`, the test fixtures (`*.fixture.ts` and any
 * `ZTest_` name), and tests themselves. A component's props are not exported,
 * so they never reach it.
 *
 * And the other way round, across `src/shared/` and `src/common/`: a type a
 * shared folder exports is bare, never `G`-prefixed, since `G` means "this
 * game's" and a shape two games share is not that.
 *
 * A game joins the list at step 6 of its conversion (plans/seat-view.md → How
 * a game converts).
 */

/** The games converted onto the page blobs, whose `types.ts` is under the rule. */
const CONVERTED_GAMES = ['psychicnum', 'wordle', 'connections', 'spellingbee', 'wordwheel', 'boggle', 'codenamesduet', 'wordiply', 'waffle', 'letterboxed', 'stackdown', 'strands']

function sourceFiles(folder: string): string[] {
  return execFileSync('git', ['ls-files', folder], { encoding: 'utf8' })
    .split('\n')
    .filter(
      (f) =>
        (f.endsWith('.ts') || f.endsWith('.tsx')) &&
        !f.includes('.test.') &&
        !f.includes('.fixture.') &&
        !f.includes('/pdf/'),
    )
}

/** The source with its comments blanked, so a docstring's example is not code. */
const code = (path: string) =>
  readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const EXPORTED_TYPE = /^export (?:type|interface) (\w+)/gm

/** Every exported type name in the file, with its line. */
function exportedTypes(path: string): { name: string; line: number }[] {
  const text = code(path)
  const found: { name: string; line: number }[] = []
  for (const m of text.matchAll(EXPORTED_TYPE)) {
    found.push({ name: m[1]!, line: text.slice(0, m.index).split('\n').length })
  }
  return found
}

describe("a converted game's types", () => {
  it('every exported type is in types.ts, or reactTypes.ts', () => {
    const offenders: string[] = []
    for (const game of CONVERTED_GAMES) {
      for (const f of sourceFiles(`src/${game}`)) {
        if (f.endsWith('/types.ts') || f.endsWith('/reactTypes.ts')) continue
        for (const t of exportedTypes(f)) {
          if (t.name.startsWith('ZTest_')) continue
          offenders.push(`${f}:${t.line} exports ${t.name}`)
        }
      }
    }
    expect(
      offenders,
      "These export a type from outside the game's types.ts. Move it there, with a `G` prefix, " +
        'or stop exporting it:',
    ).toEqual([])
  })

  it('every type in types.ts and reactTypes.ts starts with G', () => {
    const offenders: string[] = []
    for (const game of CONVERTED_GAMES) {
      for (const file of ['types.ts', 'reactTypes.ts']) {
        const path = `src/${game}/${file}`
        if (!existsSync(path)) continue
        for (const t of exportedTypes(path)) {
          if (!/^G[A-Z]/.test(t.name)) offenders.push(`${path}:${t.line} exports ${t.name}`)
        }
      }
    }
    expect(offenders, "These names in a game's types.ts lack the `G` prefix:").toEqual([])
  })

  it('no shared folder exports a G-prefixed type', () => {
    const offenders: string[] = []
    for (const folder of ['src/shared', 'src/common']) {
      for (const f of sourceFiles(folder)) {
        for (const t of exportedTypes(f)) {
          if (/^G[A-Z]/.test(t.name)) offenders.push(`${f}:${t.line} exports ${t.name}`)
        }
      }
    }
    expect(
      offenders,
      'These shared types carry the `G` that means "this game\'s". Drop it; each game names ' +
        'the shape as its own in its types.ts:',
    ).toEqual([])
  })
})
