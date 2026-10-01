// cs-unmet

import type { Board, Category } from './board'
import type { MatchedCategory } from '../hooks/useGame'

/** The categories nobody on this board matched — what the reveal swaps in for
 *  the loose tiles. */
export function unmatchedCategories(board: Board, matched: MatchedCategory[]): Category[] {
  const matchedRanks = new Set(matched.map((m) => m.rank))
  return board.categories.filter((c) => !matchedRanks.has(c.rank))
}
