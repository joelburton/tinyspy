// cs-unmet

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACTIONS, type ActionSpec } from '../common/actions/registry'
import { isPattern } from '../common/actions/chord'

/**
 * Guard: nothing catches a registered chord by hand.
 *
 * A command's key comes from binding its action, and that is the whole of what
 * makes the key list honest and the help bubble right. A handler somewhere
 * matching `e.code === 'KeyZ'` gets the same keystroke to the same place while
 * belonging to no action — so the list does not know about it, the tooltip does
 * not say it, and the dispatcher cannot tell it to stand down inside a chat box.
 * It is the one way back to the world this whole system replaced, and it looks
 * completely reasonable in a diff.
 *
 * **What is flagged, and only this:**
 *
 *   - `.code === '…'` against a physical key the registry owns. There is no
 *     other use for `e.code` in this app — reading the physical key IS chord
 *     matching, which is why Option chords are written that way.
 *   - `.key === '…'` against one of the registry's CHARACTER chords (`/`, `?`,
 *     `#`, …). Those are commands and nothing else; no field handles one.
 *
 * **What is deliberately NOT flagged**, because a guard that cries wolf gets
 * switched off: `Enter`, `Tab`, `Space`, `Backspace` and the arrows read as
 * `e.key`. A real form owns its keys (docs/ui.md → Real forms), and those are
 * exactly the ones it owns — crosswords' rebus box commits on Enter, the menu
 * walks on arrows, a dialog closes on Escape. The registry owns those keys too,
 * but owning them on the BOARD is a different claim from owning them
 * everywhere.
 *
 * `common/actions/` is exempt because it is the matching, and
 * `common/keyboard/` because the Tab clauses left there belong to
 * `plans/tab-rings.md`.
 */

/** Where a hand-written match is allowed to live. */
const EXEMPT = ['src/common/actions/', 'src/common/keyboard/']

/** Every tracked TypeScript file under `src/`, via git so build output and
 *  anything untracked can't leak in. Tests are the one place a chord is
 *  legitimately typed out — they press keys. */
function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .filter((f) => !f.includes('.test.'))
    .filter((f) => !EXEMPT.some((dir) => f.startsWith(dir)))
}

/** The chords the registry owns, split by which half of the event they read.
 *  Derived rather than listed, so a new entry is covered the day it lands. */
function ownedLiterals(): { codes: string[]; characters: string[] } {
  const codes = new Set<string>()
  const characters = new Set<string>()
  for (const spec of Object.values(ACTIONS)) {
    for (const key of (spec as ActionSpec).keys ?? []) {
      if (isPattern(key)) continue
      if (key.code !== undefined) codes.add(key.code)
      // A NAMED key (Enter, Tab, ⌫, an arrow, Space) is a key a focused field
      // legitimately handles; a one-character chord is a command.
      if (key.key !== undefined && key.key.length === 1 && key.key !== ' ') {
        characters.add(key.key)
      }
    }
  }
  return { codes: [...codes], characters: [...characters] }
}

/** `e.code === 'KeyZ'` / `event.key === '/'`, either way round. */
function comparisons(half: 'key' | 'code', literals: string[]): RegExp {
  const alt = literals.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(`(?:\\.${half}\\s*===\\s*'(${alt})'|'(${alt})'\\s*===\\s*\\w+\\.${half})`, 'g')
}

describe('registered chords', () => {
  it('finds files to read at all', () => {
    // Without this, a broken `git ls-files` would make the guard below pass
    // while reading nothing — the failure mode a guard must not have.
    expect(sourceFiles().length).toBeGreaterThan(100)
  })

  it('owns at least one chord of each kind, so the patterns are not empty', () => {
    // An empty alternation matches everything or nothing depending on the
    // engine; either way the guard would stop meaning what it says.
    const { codes, characters } = ownedLiterals()
    expect(codes.length).toBeGreaterThan(0)
    expect(characters.length).toBeGreaterThan(0)
  })

  it('are caught by binding the action, never by hand', () => {
    const { codes, characters } = ownedLiterals()
    const patterns = [comparisons('code', codes), comparisons('key', characters)]
    const wrong: string[] = []
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8')
      for (const pattern of patterns) {
        for (const [match] of src.matchAll(pattern)) wrong.push(`${file}: ${match.trim()}`)
      }
    }
    expect(
      wrong,
      'A chord the registry owns, matched by hand. Bind the action instead — ' +
        'that is what puts the key in the help list, in the button\'s bubble, ' +
        'and under the dispatcher\'s gates. If the key genuinely belongs to a ' +
        'focused field rather than to the page, it is the FIELD that should ' +
        'own it, and this list is the wrong shape for that.\n\n' + wrong.join('\n'),
    ).toEqual([])
  })
})
