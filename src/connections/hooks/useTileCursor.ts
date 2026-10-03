// cs-unmet

import type { BoardShape, Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import {
  useBoardSelectionCursor,
} from '@/common/board-cursor/useBoardSelectionCursor'
import type { GTile } from '../types'

/**
 * The keyboard's way onto connections' board: arrows move the selection
 * cursor over the loose tiles, Space picks the tile under it (or un-picks it,
 * since a pick toggles), and a click on a tile picks it and moves the cursor
 * there, hidden. See `useBoardSelectionCursor` for the rules every board's
 * cursor keeps.
 *
 * The cursor sits on a CELL, so a shuffle moves the tiles under it, and a
 * solved band — a row fewer — pulls it onto the nearest tile left.
 */
export function useTileCursor({
  displayedTiles,
  boardShape,
  isInteractive,
  onPick,
}: {
  // The loose tiles in the order the board draws them.
  displayedTiles: readonly GTile[]
  boardShape: BoardShape
  // The board takes a pick right now; the cursor is inert while not.
  isInteractive: boolean
  onPick: (tile: GTile) => void
}): {
  // The cell the cursor is on, or null while it is hidden.
  cell: Cell | null
  // Its place in `displayedTiles`, or null while hidden.
  position: number | null
  pickClicked: (tile: GTile) => void
} {

  const selectionCursor = useBoardSelectionCursor({
    shape: boardShape,
    enabled: isInteractive,
    onToggle: (cell: Cell) => {
      const tile = displayedTiles[positionAt(cell.x,
        cell.y,
        boardShape.numCols)]
      if (tile !== undefined) onPick(tile)
    },
  })

  function pickClicked(tile: GTile) {
    const cell = cellAt(
      displayedTiles.findIndex((t) => t.id === tile.id), boardShape.numCols)
    selectionCursor.setTo(cell)
    onPick(tile)
  }

  const cell = selectionCursor.cell

  return {
    cell,
    position: cell === null ? null : positionAt(cell.x,
      cell.y,
      boardShape.numCols),
    pickClicked,
  }
}
