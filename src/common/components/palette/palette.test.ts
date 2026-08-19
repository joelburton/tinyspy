import { describe, expect, it } from 'vitest'
import { FAMILIES, tokenOf } from './palette'

/**
 * Guard: a family is a RECTANGLE — every member carries every variant.
 *
 * This is the half `cssTokens.test.ts` cannot see. That test knows whether a
 * token is defined and whether anything reads it; it has no idea that
 * `--outcome-near-wash-color` was missing for a month while its four siblings
 * existed, because nothing referenced it and nothing defined it. A hole is
 * invisible to a scanner and obvious in a grid.
 *
 * Why it matters more than tidiness: a family is picked at one sitting, by one
 * formula. The cell you skip because nothing needs it yet is the cell someone
 * derives alone in two years, beside the one component that wanted it, against
 * whatever that component looked like — and the family stops being one.
 *
 * The reverse direction (a cell here naming a token nobody defines) is already
 * covered: `cssTokens.test.ts`'s phantom-reference guard reads this file's
 * `var(…)` strings like any other source file. Between them, a family can lose
 * neither a cell nor a value without a test naming it.
 */
describe('every color family is complete', () => {
  it('every member carries every variant', () => {
    const holes = FAMILIES.flatMap((f) =>
      f.members
        .filter((m) => m.cells.length !== f.variants.length)
        .map((m) => `${f.name} → ${m.name}: ${m.cells.length} cells, ${f.variants.length} variants`),
    )
    expect(holes, `A family is a rectangle — these members are short a cell:\n${holes.join('\n')}`)
      .toEqual([])
  })

  it('no cell is written twice', () => {
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const f of FAMILIES)
      for (const m of f.members)
        for (const cell of m.cells) {
          const key = `${f.name}:${tokenOf(cell)}`
          if (seen.has(key)) dupes.push(key)
          seen.add(key)
        }
    // A copy-paste that left the wrong token behind reads as a plausible swatch
    // on screen — two cells showing one color, in a page whose whole job is to
    // show you every color exactly once.
    expect(dupes, `Repeated within one family:\n${dupes.join('\n')}`).toEqual([])
  })

  it('every cell is a var() reference, spelled out in full', () => {
    const bad = FAMILIES.flatMap((f) =>
      f.members.flatMap((m) =>
        m.cells.filter((c) => !/^var\(--[a-z0-9-]+\)$/.test(c)).map((c) => `${f.name} → ${c}`),
      ),
    )
    // The literal spelling is the mechanism, not a style: a name built from a
    // template collapses to its prefix in the token scanner, which then vouches
    // for tokens that no longer exist. See palette.ts.
    expect(bad, `Not a plain var(--token) reference:\n${bad.join('\n')}`).toEqual([])
  })
})
