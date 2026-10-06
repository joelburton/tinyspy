// cs-unmet

import type { Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import { BOARD_SHAPE } from '../lib/boardShape'
import type { GTile } from '../types'

/**
 * The keyboard's way onto strands' board: arrows move the selection cursor
 * over the letters, Space picks the letter under it — exactly a click, by
 * `clickTile`'s rule — and a click on a letter picks it and moves the cursor
 * there, hidden. See `useBoardSelectionCursor` for the rules every board's
 * cursor keeps.
 *
 * strands' keys move it too: a typed letter and a submitted word put it,
 * hidden, on the tile they used (`moveTo`), so the next arrow shows it there.
 */
export function useTileCursor({
  tiles,
  canPick,
  onPick,
}: {
  // All 48, row by row — the order the board draws them.
  tiles: readonly GTile[]
  // Whether a pick is possible right now; the cursor is inert while not.
  canPick: boolean
  onPick: (tile: GTile) => void
}): {
  cell: Cell | null
  pickClicked: (tile: GTile) => void
  moveTo: (tile: GTile) => void
} {
  const selectionCursor = useBoardSelectionCursor({
    shape: BOARD_SHAPE,
    enabled: canPick,
    onToggle: (cell) => onPick(tiles[positionAt(cell.x, cell.y, BOARD_SHAPE.numCols)]!),
  })

  function moveTo(tile: GTile) {
    selectionCursor.setTo(cellAt(tiles.findIndex((t) => t.id === tile.id), BOARD_SHAPE.numCols))
  }

  function pickClicked(tile: GTile) {
    moveTo(tile)
    onPick(tile)
  }

  return { cell: selectionCursor.cell, pickClicked, moveTo }
}
