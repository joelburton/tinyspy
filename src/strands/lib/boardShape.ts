// cs-unmet

import type { BoardShape, Cell } from '@/common/board-cursor/stepCell'
import { COLS, ROWS, type Coord } from './board'

/**
 * The shape of the board, for the keyboard's selection cursor: every cell of
 * the 6-across, 8-down grid exists. A letter spent on a found word still
 * exists — the cursor rests on it, and Space does there what a click does,
 * which is nothing.
 */
export const BOARD_SHAPE: BoardShape = { cols: COLS, rows: ROWS, exists: () => true }

/** The board's `[row, col]` for a cursor cell. */
export const coordAt = (cell: Cell): Coord => [cell.y, cell.x]

/** The cursor cell for a board `[row, col]`. */
export const cellAt = ([row, col]: Coord): Cell => ({ x: col, y: row })
