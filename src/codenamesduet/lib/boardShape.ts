// cs-unmet

import type { BoardShape } from '@/common/board-cursor/stepCell'

/** Words across and down — the Duet board is five by five. */
const SIDE = 5

/**
 * The shape of the board, for the keyboard's selection cursor: every cell of a
 * 5×5 grid exists, and word `position` sits at (position % 5, position / 5),
 * the order `useBoard` reads them in and the grid (Board.module.css `--cols`)
 * lays them out.
 */
export const BOARD_SHAPE: BoardShape = { numCols: SIDE, numRows: SIDE, exists: () => true }
