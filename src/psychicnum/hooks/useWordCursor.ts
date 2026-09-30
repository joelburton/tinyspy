// cs-unmet

import type { BoardShape, Cell } from '@/common/board-cursor/stepCell'
import { cellAt, positionAt } from '@/common/board-cursor/boardPosition'
import { useBoardSelectionCursor } from '@/common/board-cursor/useBoardSelectionCursor'
import type { TileResults } from '../lib/tileResults'

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
  shuffledWords: readonly string[]
  boardShape: BoardShape
  // A decided tile cannot be picked, by key or by click.
  results: TileResults
  pickedWord: string | null
  // Whether a pick is possible right now; the cursor is inert while not.
  canPick: boolean
  // Pick a word, or un-pick with null.
  onPick: (word: string | null) => void
}): {
  cursor: Cell | null
  pickClickedTile: (word: string) => void
} {
  function wordAtCell(cell: Cell): string | undefined {
    return shuffledWords[positionAt(cell.x, cell.y, boardShape.cols)]
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

  function pickClickedTile(word: string) {
    setCursorTo(cellAt(shuffledWords.indexOf(word), boardShape.cols))
    onPick(word)
  }

  return { cursor, pickClickedTile }
}
