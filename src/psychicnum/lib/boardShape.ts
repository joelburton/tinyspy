// cs-unmet

import type { BoardShape } from '@/common/board-cursor/stepCell'
import { positionAt } from '@/common/board-cursor/boardPosition'

/**
 * The shape of a board of `wordCount` tiles: a roughly-square grid
 * (`numCols = ⌈√N⌉`) filled row by row, so the last row may be short and the
 * cells past the last word do not exist. The same answer lays the tiles out
 * and steps the keyboard cursor over them.
 */
export function makeBoardShape(wordCount: number): BoardShape {
  const numCols = Math.ceil(Math.sqrt(wordCount))
  return {
    numCols,
    numRows: Math.ceil(wordCount / numCols),
    exists: (x, y) => positionAt(x, y, numCols) < wordCount,
  }
}
