// cs-unmet

import type { BoardShape, Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import type { GTile } from '../types'

/**
 * The keyboard's way onto psychicnum's board: arrows move the selection cursor
 * over the tiles, Space picks the tile under it or un-picks it, and a click on
 * a tile picks it and moves the cursor there, hidden. See
 * `useBoardSelectionCursor` for the rules every board's cursor keeps.
 *
 * The cursor sits on a CELL, so a shuffle moves the tiles under it; the pick,
 * being a tile, moves with it.
 */
export function useTileCursor({
  displayedTiles,
  boardShape,
  pickedTile,
  canPick,
  onPick,
}: {
  // The tiles in the order the board draws them.
  displayedTiles: readonly GTile[]
  boardShape: BoardShape
  pickedTile: GTile | null
  // Whether a pick is possible right now; the cursor is inert while not.
  canPick: boolean
  // Pick a tile, or un-pick with null.
  onPick: (tile: GTile | null) => void
}): {
  cell: Cell | null
  pickClicked: (tile: GTile) => void
} {
  function tileAtCell(cell: Cell): GTile | undefined {
    return displayedTiles[positionAt(cell.x, cell.y, boardShape.numCols)]
  }

  // Space toggles, so a second press un-picks. A decided tile cannot be
  // picked, by key or by click.
  function togglePickAtCell(cell: Cell) {
    const tile = tileAtCell(cell)
    if (tile === undefined || tile.correct !== null) return
    onPick(pickedTile?.id === tile.id ? null : tile)
  }

  const selectionCursor = useBoardSelectionCursor({
    shape: boardShape,
    enabled: canPick,
    onToggle: togglePickAtCell,
  })

  function pickClicked(tile: GTile) {
    selectionCursor.setTo(cellAt(displayedTiles.findIndex((t) => t.id === tile.id), boardShape.numCols))
    onPick(tile)
  }

  return { cell: selectionCursor.cell, pickClicked }
}
