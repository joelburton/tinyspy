// cs-unmet

import { positionAt } from '@/common/board-cursor/boardPosition'
import type { BoardShape } from '@/common/board-cursor/stepCell'
import { GRID, isHole } from './waffle'

/**
 * The shape of the board, for the keyboard's selection cursor: the 5×5 grid
 * with its four holes missing. A hole is shape, not state — it never has a
 * letter to pick — so an arrow passes over it to the tile beyond.
 */
export const BOARD_SHAPE: BoardShape = {
  numCols: GRID,
  numRows: GRID,
  exists: (x, y) => !isHole(positionAt(x, y, GRID)),
}
