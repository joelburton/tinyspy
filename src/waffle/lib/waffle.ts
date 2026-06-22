/**
 * Waffle board geometry — the fixed 5×5 lattice that every part of
 * the game agrees on: the puzzle generator (offline), the server
 * (mirrored as constants in the `waffle` migration), and the FE
 * render. Keep this the single TS source of truth; if the lattice
 * ever changes, the SQL `waffle.compute_colors` word arrays change
 * with it.
 *
 * Layout (row-major positions 0–24). Words run on rows 0/2/4 (across)
 * and columns 0/2/4 (down); the 4 interior cells where both row and
 * column are odd belong to no word and are "holes":
 *
 *      0  1  2  3  4        a0 = 0 1 2 3 4       d0 = 0 5 10 15 20
 *      5  ·  7  ·  9        a2 = 10 11 12 13 14  d2 = 2 7 12 17 22
 *     10 11 12 13 14        a4 = 20 21 22 23 24  d4 = 4 9 14 19 24
 *     15  · 17  · 19
 *     20 21 22 23 24        holes: 6 8 16 18
 *
 * A board is a 25-char string: holes are the literal `.`, every other
 * cell a lowercase letter. The first/middle/last cell of each across
 * word is shared with a down word — the 9 "intersection" cells.
 */

/** Side length of the square grid. */
export const GRID = 5
/** Total cells, holes included. */
export const CELLS = GRID * GRID // 25
/** The hole sentinel in a board string. */
export const HOLE = '.'

/**
 * The 4 holes — interior cells in no word. (row, col) both odd:
 * (1,1)=6, (1,3)=8, (3,1)=16, (3,3)=18.
 */
export const HOLES: readonly number[] = [6, 8, 16, 18]

/** True if `pos` is a hole (no letter; can't be swapped). */
export function isHole(pos: number): boolean {
  return HOLES.includes(pos)
}

/** True if `pos` is a filled, letter-bearing cell. */
export function isFilled(pos: number): boolean {
  return pos >= 0 && pos < CELLS && !isHole(pos)
}

/** The 21 filled positions, ascending. */
export const FILLED: readonly number[] = Array.from(
  { length: CELLS },
  (_, i) => i,
).filter(isFilled)

/**
 * Human-readable grid coordinate for a position, like a spreadsheet:
 * columns A–E (left→right), rows 1–5 (top→bottom). Position 0 → "A1",
 * the center (12) → "C3", position 24 → "E5". Used by the move log.
 */
export function coord(pos: number): string {
  const col = pos % GRID
  const row = Math.floor(pos / GRID)
  return `${String.fromCharCode(65 + col)}${row + 1}`
}

/**
 * The 6 words as ordered cell-index tuples, in canonical order
 * (3 across, then 3 down). Mirrors the `words` array in
 * `waffle.compute_colors`.
 */
export const WORDS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4], // a0 — across, row 0
  [10, 11, 12, 13, 14], // a2 — across, row 2
  [20, 21, 22, 23, 24], // a4 — across, row 4
  [0, 5, 10, 15, 20], // d0 — down, col 0
  [2, 7, 12, 17, 22], // d2 — down, col 2
  [4, 9, 14, 19, 24], // d4 — down, col 4
]

/**
 * The word(s) a cell belongs to — two for an intersection, one for a
 * single-word cell. (Holes belong to none and return `[]`.)
 */
export function wordsContaining(pos: number): readonly (readonly number[])[] {
  return WORDS.filter((w) => w.includes(pos))
}

/** Pull the letters at `cells` out of a 25-char board string. */
export function lettersAt(board: string, cells: readonly number[]): string {
  return cells.map((c) => board[c]).join('')
}

/** The 6 words a board currently spells, in `WORDS` order. */
export function boardWords(board: string): string[] {
  return WORDS.map((w) => lettersAt(board, w))
}

/**
 * Structural validity of a board string: correct length, holes are
 * `.`, every filled cell is a single ASCII letter. Does NOT check
 * that the words are real — that's the generator's job.
 */
export function isValidBoard(board: string): boolean {
  if (board.length !== CELLS) return false
  for (let i = 0; i < CELLS; i++) {
    if (isHole(i)) {
      if (board[i] !== HOLE) return false
    } else if (!/^[a-z]$/i.test(board[i])) {
      return false
    }
  }
  return true
}
