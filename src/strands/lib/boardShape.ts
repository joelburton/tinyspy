// cs-unmet

import type { BoardShape } from '@/common/board-cursor/stepCell'
import { COLS, ROWS } from './board'

/**
 * The shape of the board, for the keyboard's selection cursor: every cell of
 * the 6-across, 8-down grid exists. A letter spent on a found word still
 * exists — the cursor rests on it, and Space does there what a click does,
 * which is nothing.
 */
export const BOARD_SHAPE: BoardShape = { numCols: COLS, numRows: ROWS, exists: () => true }
