// cs-unmet

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
 * ⚠️ TUNED SURFACES ARE EXEMPT, and that is the DEFAULT scope, not the rule.
 * A game's board fits its own game; that is what tuned means (docs/naming.md
 * → tuned / justified / locked), so a vocabulary checks `src/common/` unless
 * it says otherwise.
 *
 * `z-index` says otherwise, and is the shape of the exception: a board's
 * radius is a game's decision, but a board's rank against the chat panel is a
 * whole-app decision that merely happens to be WRITTEN in a game's file. Being
 * tuned buys a game freedom over its own surface — never over where that
 * surface sits in the page's stacking order.
 */

const SRC = join(process.cwd(), 'src')
const rel = (f: string) => f.replace(`${process.cwd()}/`, '')

function walk(dir: string, exts: string[] = ['.css']): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/** `//` to end of line, but not the one inside `https://`. TS only — CSS has
 *  no line comments, and a stray `//` there would eat a real declaration. */
const stripLineComments = (s: string) => s.replace(/(^|[^:])\/\/[^\n]*/g, '$1')

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
  /** Where to look, under `src/`. Defaults to `common` — tuned surfaces are
   *  exempt. Widen it only for a value a game does not get to decide. */
  root?: string
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
    // (The pill gets a name when badges are settled in the homepage area; until then it
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
  {
    name: 'z-index',
    property: 'z-index',
    // 0–10 is LOCAL layering inside a component's own stacking context — a
    // ring over a tile, a shuffle floating on its board, the keyboard cursor.
    // Those compete only with their siblings, so they are not on the ladder
    // and do not want a name. The cut is 10 because the app has a clean gap
    // there: everything local today is ≤ 10 and everything page-level is
    // ≥ 40, which is what makes a number the honest test. If something ever
    // needs 11 locally, that is the conversation, not a quiet edit here.
    allowed: /^([0-9]|10|auto|inherit|initial|unset|revert)$/,
    root: '.',
    pending: [
      // All three are recorded decisions, not oversights — plans/css-system-2.md
      // §7 → Carried forward names the area that owns each.
      'src/bananagrams/components/PlayerBoard.module.css', // drag ghost, 1000 → shared-game-chrome
      'src/scrabble/components/BoardCol.module.css', //       drag ghost, 100  → shared-game-chrome
      'src/scrabble/components/BlankPicker.module.css', //     overlay, 50     → the scrabble area
    ],
    fix:
      'Page-level layers read a token from base.css → the z-index ladder. A ' +
      'tier that is not on it is a question for Joel: inventing a number ' +
      'between two named ones is how a menu ends up behind a backdrop.',
  },
]

describe('a converted surface writes vocabulary values, not literals', () => {
  for (const v of VOCABULARIES) {
    it(`${v.name}: every converted file uses the vocabulary`, () => {
      const pending = new Set(v.pending)
      const offenders: string[] = []
      const cleanPending = new Set(v.pending)

      for (const f of walk(join(SRC, v.root ?? 'common'))) {
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
          // CONTAINS, not starts-with: `calc(var(--z-index-popover) + 1)` is a
          // derivation off the ladder, which is the point of naming the tier.
          if (value.includes('var(')) continue
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

/**
 * The z-index ladder's other half.
 *
 * `<FloatingPanel>` takes its tier as a prop, so the order could be restated
 * in TypeScript — and a second copy of a stacking order is exactly the copy
 * that drifts, because nothing makes the two disagree loudly. The prop is
 * typed `string` so a call site passes `var(--z-index-chatPanel)`; this is
 * what stops someone typing the number back in.
 *
 * A COMPUTED z-index stays legal — stackdown stacks its tile pile with
 * `zIndex: t.z`, which is per-tile data inside a board's own context and has
 * no business being a token.
 */
describe('the z-index ladder has one home', () => {
  it('no numeric z-index is written in TypeScript', () => {
    const offenders: string[] = []
    for (const f of walk(join(SRC, '.'), ['.ts', '.tsx'])) {
      if (f.endsWith('.test.ts') || f.endsWith('.test.tsx')) continue
      const src = stripLineComments(stripComments(readFileSync(f, 'utf8')))
      // `zIndex: 500` (a style object) and `zIndex={500}` (a JSX prop).
      for (const m of src.matchAll(/zIndex\s*(?::\s*|=\{)(\d+)/g)) {
        offenders.push(`${rel(f)}  →  zIndex ${m[1]}`)
      }
    }
    expect(
      offenders,
      'A z-index literal in TypeScript. The ladder lives in base.css; pass ' +
        'the token instead — zIndex="var(--z-index-chatPanel)".\n' +
        offenders.join('\n'),
    ).toEqual([])
  })
})
