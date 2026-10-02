// cs-unmet

import type { BoardShape, Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import type { GTileResults, GTileWord } from '../types'

/**
 * The keyboard's way onto psychicnum's board: arrows move the selection cursor
 * over the tiles, Space picks the word under it or un-picks it, and a click on
 * a tile picks it and moves the cursor there, hidden. See
 * `useBoardSelectionCursor` for the rules every board's cursor keeps.
 *
 * The cursor sits on a CELL, so a shuffle moves the words under it; the pick,
 * being a word, moves with its tile.
 */
export function useTileCursor({
  displayedTiles,
  boardShape,
  results,
  pickedTile,
  canPick,
  onPick,
}: {
  // The words in the order the board draws them.
  displayedTiles: readonly GTileWord[]
  boardShape: BoardShape
  // A decided tile cannot be picked, by key or by click.
  results: GTileResults
  pickedTile: GTileWord | null
  // Whether a pick is possible right now; the cursor is inert while not.
  canPick: boolean
  // Pick a word, or un-pick with null.
  onPick: (word: GTileWord | null) => void
}): {
  cell: Cell | null
  pickClicked: (word: GTileWord) => void
} {
  function wordAtCell(cell: Cell): GTileWord | undefined {
    return displayedTiles[positionAt(cell.x, cell.y, boardShape.numCols)]
  }

  // Space toggles, so a second press un-picks.
  function togglePickAtCell(cell: Cell) {
    const word = wordAtCell(cell)
    if (word === undefined || results.has(word)) return
    onPick(pickedTile === word ? null : word)
  }

  const selectionCursor = useBoardSelectionCursor({
    shape: boardShape,
    enabled: canPick,
    onToggle: togglePickAtCell,
  })

  function pickClicked(word: GTileWord) {
    selectionCursor.setTo(cellAt(displayedTiles.indexOf(word), boardShape.numCols))
    onPick(word)
  }

  return { cell: selectionCursor.cell, pickClicked }
}
