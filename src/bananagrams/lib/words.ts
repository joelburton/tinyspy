// cs-unmet

import { GRID, idx } from './board'

/**
 * Every word on a player board: each maximal run of 2+ adjacent tiles, read
 * ACROSS (left-to-right within a row) and DOWN (top-to-bottom within a column).
 *
 * This mirrors the server's notion of a "word" in `bananagrams._win_blockers`
 * (the win-time spell check): a run is any unbroken line of letters, and a lone
 * tile is never a word. The server has it in SQL because that's where the win is
 * validated; this twin lets the page list the same words without a round trip,
 * for the print's word list.
 *
 * Returns the words in the data's lowercase, in board order (every across run
 * row by row, then every down run column by column). The caller decides sorting
 * and de-duplication — this is the honest primitive, so "cat" appearing twice on
 * the board is returned twice.
 */
export function boardWords(board: string): string[] {
  const words: string[] = []
  // Across — walk each row; a run ends at a gap or the right edge. The sentinel
  // pass at x === GRID (a virtual '.') flushes a run that reaches the last column.
  for (let y = 0; y < GRID; y++) {
    let run = ''
    for (let x = 0; x <= GRID; x++) {
      const ch = x < GRID ? board[idx(x, y)] : '.'
      if (ch !== '.') run += ch
      else {
        if (run.length >= 2) words.push(run)
        run = ''
      }
    }
  }
  // Down — the same scan over each column, top to bottom.
  for (let x = 0; x < GRID; x++) {
    let run = ''
    for (let y = 0; y <= GRID; y++) {
      const ch = y < GRID ? board[idx(x, y)] : '.'
      if (ch !== '.') run += ch
      else {
        if (run.length >= 2) words.push(run)
        run = ''
      }
    }
  }
  return words
}
