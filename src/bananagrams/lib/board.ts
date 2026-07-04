/**
 * Player-board model — a FIXED 25×25 arena.
 *
 * The board is a flat `GRID*GRID` = 625-char string: `board[idx(x, y)]` is a
 * letter or `'.'` (empty). The grid never resizes — you navigate it with zoom
 * + scroll — so placing a tile can never shift the view, which is what keeps
 * this code simple (no view box, no growth, no scroll compensation). Coordinates
 * are bounded to `[0, GRID-1]`, so a placement is just a string write.
 *
 * The HAND is not stored — it's DERIVED from the two server/FE-split pieces:
 * `hand = tiles − placed`, where `tiles` (server-owned) is everything the
 * player holds and `placed` is the letters already on the board. See
 * `deriveHand` + the comment on bananagrams.player_boards. A local "shuffle"
 * order is layered on top with `reconcileHandOrder`.
 */

export const GRID = 25
export const DEFAULT_CELL = 40 // px per cell; the smallest zoom is computed to fit the grid
export const MAX_CELL = 64

/** Flat board index from (x, y). x = column, y = row; both 0..GRID-1.
 *  Same x-first convention as scrabble's `cellIndex`. */
export const idx = (x: number, y: number) => y * GRID + x
export const inBounds = (x: number, y: number) => x >= 0 && x < GRID && y >= 0 && y < GRID
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

/** The letters currently placed on the board (the non-empty cells). */
export function boardLetters(board: string): string {
  return board.replace(/\./g, '')
}

/**
 * Multiset subtraction over letter strings: `a` with ONE occurrence of each
 * char in `b` removed, preserving `a`'s order. (`"AAB" − "A" = "AB"`.) A char
 * in `b` not found in `a` is simply ignored.
 */
export function multisetSubtract(a: string, b: string): string {
  const counts = new Map<string, number>()
  for (const ch of b) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let out = ''
  for (const ch of a) {
    const n = counts.get(ch) ?? 0
    if (n > 0) counts.set(ch, n - 1) // consume one — drop this char
    else out += ch
  }
  return out
}

/**
 * The player's hand: every tile they hold (`tiles`) minus the letters already
 * placed on the `board`. This is the canonical multiset; display order is a
 * separate concern (see `reconcileHandOrder`).
 */
export function deriveHand(tiles: string, board: string): string {
  return multisetSubtract(tiles, boardLetters(board))
}

/**
 * Reconcile a local shuffle order against the canonical hand multiset — the
 * multiset-aware sibling of connections's `reconcileLocalOrder` (letters repeat,
 * so we count occurrences rather than use a Set). Keeps the chars `order`
 * already has (in their positions), drops any the canonical no longer has, and
 * appends canonical chars `order` is missing (newly drawn from peel/dump) at
 * the end. Computed in render — never stored — so a placement, a peel, or a
 * dump just changes the canonical and this re-derives.
 */
export function reconcileHandOrder(order: string, canonical: string): string {
  const counts = new Map<string, number>()
  for (const ch of canonical) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let kept = ''
  for (const ch of order) {
    const n = counts.get(ch) ?? 0
    if (n > 0) {
      kept += ch
      counts.set(ch, n - 1)
    }
  }
  // Anything still counted is in `canonical` but not in `order` — append it in
  // canonical order so duplicates land predictably.
  let extra = ''
  for (const ch of canonical) {
    const n = counts.get(ch) ?? 0
    if (n > 0) {
      extra += ch
      counts.set(ch, n - 1)
    }
  }
  return kept + extra
}

/** Fisher–Yates shuffle of a string's characters (pure). */
export function shuffleString(s: string): string {
  const out = s.split('')
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.join('')
}

export type Extent = { minX: number; maxX: number; minY: number; maxY: number }

/** Bounding box of the placed tiles, or null when the board is empty. */
export function tilesExtent(board: string): Extent | null {
  let minX = GRID,
    maxX = -1,
    minY = GRID,
    maxY = -1
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (board[idx(x, y)] !== '.') {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxY < 0) return null
  return { minX, maxX, minY, maxY }
}

/**
 * The used portion of the board as a row-major 2D grid, CROPPED to the bounding
 * box of the placed tiles — each cell an UPPERCASE letter, or `''` for an empty
 * cell inside the box (a gap in the crossword). An empty board returns `[]`.
 *
 * This is what the print renders: it sizes the tiles to the crop's width, so the
 * board fills the paper regardless of where in the 25×25 arena the player built.
 */
export function boardToGrid(board: string): string[][] {
  const ext = tilesExtent(board)
  if (!ext) return []
  const grid: string[][] = []
  for (let y = ext.minY; y <= ext.maxY; y++) {
    const row: string[] = []
    for (let x = ext.minX; x <= ext.maxX; x++) {
      const ch = board[idx(x, y)]
      row.push(ch === '.' ? '' : ch.toUpperCase())
    }
    grid.push(row)
  }
  return grid
}
