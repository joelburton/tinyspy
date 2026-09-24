// cs-unmet

import type { BoardShape } from '@/common/board-cursor/stepCell'

/**
 * The shape of a board of `wordCount` tiles: a roughly-square grid
 * (`cols = ⌈√N⌉`) filled row by row, so the last row may be short and the
 * cells past the last word do not exist. The same answer lays the tiles out
 * and steps the keyboard cursor over them.
 */
export function boardShape(wordCount: number): BoardShape {
  const cols = Math.ceil(Math.sqrt(wordCount))
  return {
    cols,
    rows: Math.ceil(wordCount / cols),
    exists: (x, y) => y * cols + x < wordCount,
  }
}
