// cs-unmet

import type { BoardShape, Cell } from '@/common/board-cursor/stepCell'
import type { GTile } from '../types'
import { COLS, ROWS } from './board'

/**
 * The shape of the board, for the keyboard's selection cursor: every cell of
 * the 6-across, 8-down grid exists. A letter spent on a found word still
 * exists — the cursor rests on it, and Space does there what a click does,
 * which is nothing.
 */
export const BOARD_SHAPE: BoardShape = { numCols: COLS, numRows: ROWS, exists: () => true }

/** The cursor cell a tile sits in. */
export const cellOf = (tile: GTile): Cell => ({ x: tile.col, y: tile.row })

/** The id of the tile in a cursor cell — its place, "r,c". */
export const tileIdAt = (cell: Cell): string => `${cell.y},${cell.x}`
