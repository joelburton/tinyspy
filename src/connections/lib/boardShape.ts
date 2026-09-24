// cs-unmet

import type { BoardShape } from '@/common/board-cursor/stepCell'
import { TILES_PER_CATEGORY } from './board'

/**
 * The shape of the LOOSE tiles — the part of the board the keyboard's cursor
 * moves over. They fill a grid four across, row by row, below the solved
 * bands; a band takes a whole row, so the tiles always fill every row they
 * have (16, 12, 8, 4). Four across because a category is four tiles, and a
 * solved one becomes a band in place of a row of them.
 */
export function boardShape(tileCount: number): BoardShape {
  const cols = TILES_PER_CATEGORY
  return {
    cols,
    rows: Math.ceil(tileCount / cols),
    exists: (x, y) => y * cols + x < tileCount,
  }
}
