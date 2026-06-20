/**
 * Player-board model — a FIXED 25×25 arena.
 *
 * The board is a flat `GRID*GRID` = 625-char string: `board[idx(r, c)]` is a
 * letter or `'.'` (empty). The grid never resizes — you navigate it with zoom
 * + scroll — so placing a tile can never shift the view, which is what keeps
 * this code simple (no view box, no growth, no scroll compensation). Coordinates
 * are bounded to `[0, GRID-1]`, so a placement is just a string write. The hand
 * is likewise a string of the player's unplaced letters.
 */

export const GRID = 25
export const DEFAULT_CELL = 40 // px per cell; the smallest zoom is computed to fit the grid
export const MAX_CELL = 64

export const idx = (r: number, c: number) => r * GRID + c
export const inBounds = (r: number, c: number) => r >= 0 && r < GRID && c >= 0 && c < GRID
export const clamp = (v: number) => Math.max(0, Math.min(GRID - 1, v))

export function emptyBoard(): string {
  return '.'.repeat(GRID * GRID)
}

/** A copy of `s` with index `i` set to `ch`. */
export function setChar(s: string, i: number, ch: string): string {
  return s.slice(0, i) + ch + s.slice(i + 1)
}

/** A copy of `s` with the char at index `i` removed. */
export function removeCharAt(s: string, i: number): string {
  return s.slice(0, i) + s.slice(i + 1)
}

export type Extent = { minR: number; maxR: number; minC: number; maxC: number }

/** Bounding box of the placed tiles, or null when the board is empty. */
export function tilesExtent(board: string): Extent | null {
  let minR = GRID,
    maxR = -1,
    minC = GRID,
    maxC = -1
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (board[idx(r, c)] !== '.') {
        if (r < minR) minR = r
        if (r > maxR) maxR = r
        if (c < minC) minC = c
        if (c > maxC) maxC = c
      }
    }
  }
  if (maxR < 0) return null
  return { minR, maxR, minC, maxC }
}
