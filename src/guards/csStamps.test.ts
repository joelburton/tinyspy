// cs-na

import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain JS sprint tooling, deleted at step 12 along with this
import { inScope, readStamp, splitStamp, STAMPS } from '../../scripts/cs-stamp.mjs'

/**
 * Guard: every file in the sprint's scope says where it stands.
 *
 * The css-system sprint (plans/app-audit.md) reads the repo area by area,
 * and each file carries one `cs-` comment on its first line — `cs-unmet`
 * through `cs-blessed`. The stamp lives IN the file because the sprint renames
 * constantly and a central manifest would rot on every rename.
 *
 * A stamp that nothing checks is a stamp that rots, which is the lesson
 * `--radius-md` taught by existing unread for months. So:
 *
 *   - a file with NO stamp fails — and a brand-new file has none, which is the
 *     property that keeps the scope honest as the repo grows;
 *   - a stamp whose STATE is outside the eight fails, so a typo can't invent a
 *     ninth state that quietly means nothing.
 *
 * The area suffix a judgment stamp carries (`cs-met-deep`, `cs-blessed-forms`)
 * is NOT checked — Joel's call, 2026-09-02: it is an annotation for him, not an
 * invariant, and validating it would need a list of areas that this sprint's
 * constant renaming would rot. `splitStamp` carries the full reasoning. The
 * cost is that a typo'd AREA passes silently; the benefit is that a stamp still
 * names the area a rename has since moved on from, which is exactly the moment
 * it is there to record.
 *
 * There is deliberately no ladder here. The stamp is the latest true statement
 * about a file, not a position in a sequence: a file can go from `unmet` to
 * `audited` in one sitting, and a dependency found through the import graph can
 * sit at `found` for the rest of the sprint without that being a debt. Being
 * found is not a claim on anyone's attention.
 *
 * `scripts/cs-stamp.mjs` owns the scope and the parsing, so the definition has
 * one home; this file only asserts. Both go at step 12, when `unstamp` returns
 * every untouched file to what it was.
 */

const stamps: string[] = STAMPS

describe('cs- sprint stamps', () => {
  const files: string[] = inScope()

  it('has a scope that actually found the repo', () => {
    // A `git ls-files` that returns nothing would make every assertion below
    // vacuously pass — the failure mode where a guard cannot fail.
    expect(files.length).toBeGreaterThan(1000)
  })

  it('every file in scope carries a stamp whose state is one of the eight', () => {
    const bad = files
      .map((f) => [f, readStamp(f)] as const)
      .filter(([, s]) => s === null || !stamps.includes(splitStamp(s).state))

    expect(
      bad.map(([f, s]) => `${f}: ${s === null ? 'no stamp' : `unknown stamp cs-${s}`}`),
    ).toEqual([])
  })

  it('reports the tally', () => {
    // Not an assertion — the sprint's progress bar, printed for free by a
    // guard that has already read every file. `--reporter=verbose` shows it.
    // Counted by STATE, so the area suffixes collapse into their state.
    const counts = new Map<string, number>()
    for (const f of files) {
      const raw = readStamp(f)
      const s = raw === null ? 'MISSING' : splitStamp(raw).state
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    const line = stamps
      .filter((s) => counts.get(s))
      .map((s) => `cs-${s} ${counts.get(s)}`)
      .join(' · ')
    console.log(`  ${line} — ${files.length} files in scope`)
    expect(files.length).toBe([...counts.values()].reduce((a, b) => a + b, 0))
  })
})
