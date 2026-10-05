// cs-unmet

import type { BoardShape } from '@/common/board-cursor/stepCell'

/** Words across and down — the Duet board is five by five. */
const SIDE = 5

/**
 * The shape of the board, for the keyboard's selection cursor: every cell of a
 * 5×5 grid exists, and the tile whose id is position `p` sits at (p % 5, p / 5),
 * the order the builder writes the tiles in and the grid (Board.module.css
 * `--cols`) lays them out.
 */
export const BOARD_SHAPE: BoardShape = {
  numCols: SIDE,
  numRows: SIDE,
  exists: () => true,
}
