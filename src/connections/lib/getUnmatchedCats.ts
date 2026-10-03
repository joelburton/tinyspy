// cs-unmet

import type { GCategory, GMatchedCat } from '../types'

/** The categories a board has no band for — what the reveal swaps in for the
 *  loose tiles. */
export function getUnmatchedCats(cats: GCategory[], matchedCats: GMatchedCat[]): GCategory[] {
  const matchedRanks = new Set(matchedCats.map((m) => m.rank))
  return cats.filter((c) => !matchedRanks.has(c.rank))
}
