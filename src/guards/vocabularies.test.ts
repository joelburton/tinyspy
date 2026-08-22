import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: a converted surface writes VOCABULARY values, not literals.
 *
 * The sprint applies its vocabularies area by area, not in one sweep
 * (plans/css-system-2.md §13 → "How a value gets converted"): a raw value
 * equal to a vocabulary value is changed silently, one that isn't gets
 * looked at once, in context. Which means a guard that fails on every
 * unconverted file would be red for weeks, and a guard that only warns is
 * one nobody reads.
 *
 * So this is a **SHRINKING ALLOWLIST**, the mechanism §10 specifies:
 *
 *   - a file NOT YET CONVERTED sits in the vocabulary's `pending` list and
 *     is silent;
 *   - a CONVERTED file that regresses FAILS;
 *   - a NEW file fails immediately, because it isn't on the list — which is
 *     the property that makes this worth having on day one, before a single
 *     surface converts.
 *
 * Delete a path from `pending` when its area is converted. When a list
 * empties, delete the list — and the day every list is empty, this file has
 * done its job.
 *
 * ⚠️ TUNED SURFACES ARE EXEMPT. A game's board fits its own game; that is
 * what tuned means (docs/naming.md → tuned / justified / locked). Only
 * `src/common/` is checked — the justified and locked surfaces.
 */

const SRC = join(process.cwd(), 'src')
const rel = (f: string) => f.replace(`${process.cwd()}/`, '')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.css')) out.push(p)
  }
  return out
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * One vocabulary's rule.
 *
 * `allowed` is what a converted file may still write literally — values that
 * are not a scale at all. A radius of `0` is a square corner and `50%` is a
 * circle; neither is "a small amount of rounding" and neither wants a token.
 */
type Vocabulary = {
  name: string
  /** The property this governs. */
  property: string
  /** Literal values that stay literal. */
  allowed: RegExp
  /** Files not yet converted. Delete a line when its area is done. */
  pending: string[]
  /** What to tell someone who trips it. */
  fix: string
}

const VOCABULARIES: Vocabulary[] = [
  {
    name: 'border-radius',
    property: 'border-radius',
    // `0` a square corner · `50%` a circle · `999px` a pill — shapes, not steps.
    // (The pill gets a name when badges are settled at step 6d; until then it
    // is spelled out here rather than pretended into the scale.)
    // `inherit` and friends aren't values at all — they defer to somewhere else,
    // which is the opposite of writing a literal.
    allowed: /^(0|50%|999px|inherit|initial|unset|revert)$/,
    pending: [
      'src/common/components/feedback/GenericFeedbackPill.module.css',
      'src/common/components/game/FilterSelect.module.css',
      'src/common/components/game/RankBar.module.css',
      'src/common/components/game/entry/GuessKeyboard.module.css',
      'src/common/components/game/lists/TurnLog.module.css',
      'src/common/components/panels/GameScratchpad.module.css',
    ],
    fix:
      'Use `--radius-sm` / `-md` / `-lg`, chosen by what the thing IS — a card ' +
      'takes lg, a panel md, a chip sm (docs/deferred.md). A value that is not ' +
      'one of them is a question for Joel, not a rounding.',
  },
]

describe('a converted surface writes vocabulary values, not literals', () => {
  for (const v of VOCABULARIES) {
    it(`${v.name}: every converted file uses the vocabulary`, () => {
      const pending = new Set(v.pending)
      const offenders: string[] = []
      const cleanPending = new Set(v.pending)

      for (const f of walk(join(SRC, 'common'))) {
        const css = stripComments(readFileSync(f, 'utf8'))
        const literals: string[] = []
        // Boundary is `{`, `;` or a line start — NOT `^` alone. Anchoring on
        // the line start misses `.x { border-radius: 4px }` written on one
        // line, which this codebase does write (crosswords' ClueLists), and a
        // guard with a hole in it is worse than knowing you have none. Found
        // by planting, which is the only reason it isn't still there.
        const decl = new RegExp(`(?:^|[{;])\\s*${v.property}\\s*:\\s*([^;}]+)`, 'gm')
        for (const m of css.matchAll(decl)) {
          const value = m[1].trim()
          if (value.startsWith('var(')) continue
          if (v.allowed.test(value)) continue
          literals.push(value)
        }
        if (!literals.length) continue
        if (pending.has(rel(f))) {
          cleanPending.delete(rel(f))
          continue
        }
        offenders.push(`${rel(f)}  →  ${literals.join(', ')}`)
      }

      expect(
        offenders,
        `${v.name}: a literal value on a CONVERTED surface (or in a new file, ` +
          `which is the same thing — it isn't on the pending list).\n${v.fix}\n\n` +
          offenders.join('\n'),
      ).toEqual([])

      // The list SHRINKS. A path that no longer offends must leave it, or the
      // allowlist quietly stops meaning anything.
      expect(
        [...cleanPending],
        `${v.name}: these paths are on the pending list but no longer write a ` +
          `literal — delete them from it:\n${[...cleanPending].join('\n')}`,
      ).toEqual([])
    })
  }
})
