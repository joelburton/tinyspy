// cs-unmet

import type { BoardShape, Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import type { TileResults, TileWord } from '../lib/tileResults'

/**
 * The keyboard's way onto psychicnum's board: arrows move the selection cursor
 * over the tiles, Space picks the word under it or un-picks it, and a click on
 * a tile picks it and moves the cursor there, hidden. See
 * `useBoardSelectionCursor` for the rules every board's cursor keeps.
 *
 * The cursor sits on a CELL, so a shuffle moves the words under it; the pick,
 * being a word, moves with its tile.
 */
export function useWordCursor({
  shuffledWords,
  boardShape,
  results,
  pickedWord,
  canPick,
  onPick,
}: {
  // The words in the order the board draws them.
  shuffledWords: readonly TileWord[]
  boardShape: BoardShape
  // A decided tile cannot be picked, by key or by click.
  results: TileResults
  pickedWord: TileWord | null
  // Whether a pick is possible right now; the cursor is inert while not.
  canPick: boolean
  // Pick a word, or un-pick with null.
  onPick: (word: TileWord | null) => void
}): {
  cursor: Cell | null
  pickClickedTile: (word: TileWord) => void
} {
  function wordAtCell(cell: Cell): TileWord | undefined {
    return shuffledWords[positionAt(cell.x, cell.y, boardShape.numCols)]
  }

  // Space toggles, so a second press un-picks.
  function togglePickAtCell(cell: Cell) {
    const word = wordAtCell(cell)
    if (word === undefined || results.has(word)) return
    onPick(pickedWord === word ? null : word)
  }

  const { cursor, setCursorTo } = useBoardSelectionCursor({
    shape: boardShape,
    enabled: canPick,
    onToggle: togglePickAtCell,
  })

  function pickClickedTile(word: TileWord) {
    setCursorTo(cellAt(shuffledWords.indexOf(word), boardShape.numCols))
    onPick(word)
  }

  return { cursor, pickClickedTile }
}
