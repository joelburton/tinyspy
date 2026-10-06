// cs-unmet

import type { Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import { BOARD_SHAPE } from '../lib/boardShape'
import type { GPlayer, GTile } from '../types'

/**
 * The keyboard's way onto codenamesduet's board: arrows move the selection
 * cursor over the words, Space PICKS the word under it or un-picks it, and
 * Enter (BoardCol's) guesses the pick. A click guesses at once — the pointer's
 * aim is its confirmation — and moves the cursor there, hidden; an arrow can
 * land a cell off, and a guess can be the assassin, so the keyboard confirms
 * with a second key. See `useBoardSelectionCursor` for the rules every board's
 * cursor keeps.
 */
export function useTileCursor({
  tiles,
  pickedTile,
  canGuess,
  me,
  onPick,
  onGuess,
}: {
  // The tiles in board order.
  tiles: readonly GTile[]
  pickedTile: GTile | null
  // I may guess right now; the cursor is inert while not.
  canGuess: boolean
  // Whose cursor: it picks only a tile I may still guess.
  me: GPlayer
  // Pick a tile, or un-pick with null.
  onPick: (tile: GTile | null) => void
  // Guess a tile.
  onGuess: (tile: GTile) => void
}): {
  cell: Cell | null
  guessClicked: (tile: GTile) => void
} {
  // Space toggles, so a second press un-picks and a press elsewhere moves the
  // pick. A word the click couldn't guess can't be picked either.
  function togglePickAtCell(cell: Cell) {
    const tile = tiles[positionAt(cell.x, cell.y, BOARD_SHAPE.numCols)]
    if (tile === undefined || !tile.guessableBy.has(me)) return
    onPick(pickedTile?.id === tile.id ? null : tile)
  }

  const selectionCursor = useBoardSelectionCursor({
    shape: BOARD_SHAPE,
    enabled: canGuess,
    onToggle: togglePickAtCell,
  })

  function guessClicked(tile: GTile) {
    selectionCursor.setTo(cellAt(tiles.findIndex((t) => t.id === tile.id), BOARD_SHAPE.numCols))
    onGuess(tile)
  }

  return { cell: selectionCursor.cell, guessClicked }
}
