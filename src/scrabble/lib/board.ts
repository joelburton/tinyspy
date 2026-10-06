// cs-unmet

/**
 * scrabble (codename `scrabble`) — the board + tile *constants*.
 *
 * Unlike the board-library games (stackdown, spellingbee), scrabble's board
 * layout and tile distribution never vary between games — they're the standard
 * Scrabble constants, hard-coded here. The premium-cell grid is FE-only: the
 * server never scores (trusting commit — see play.ts), so it has no need for it.
 * The only thing mirrored SQL-side is the bag distribution + letter values that
 * `create_game`'s bag builder and end-game leftover scoring need. The only
 * per-game randomness is the bag's shuffle order. This module is the FE's half
 * of the rules; `play.ts` builds the geometry + scoring on top of it. Both are
 * pure (no React, no Supabase) so they're cheap to unit-test and safe to share.
 *
 * Letters are lowercase, the data's case, everywhere here; the capitals go on
 * where a tile is drawn.
 *
 * The model: docs/games/scrabble.md → The board model & constants.
 */

import type { GCell, GPremiumType, GTile } from '../types.ts'

export const BOARD_SIZE = 15
export const RACK_SIZE = 7
export const BINGO_BONUS = 50
/** The center cell's index (7,7) — the first play must cover it. */
export const CENTER = 7 * BOARD_SIZE + 7
/** The rack/bag glyph for a blank tile (a wild that's declared on play). */
export const BLANK = '?'


/** Flat board index from (x, y). x = column, y = row; both 0..14. */
export function cellIndex(x: number, y: number) {
  return y * BOARD_SIZE + x
}

export function inBounds(x: number, y: number) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
}


/** A cell's id, `"x,y"`. */
export function makeCellId(x: number, y: number) {
  return `${x},${y}`
}

/** The cell an id names. */
export function readCellXY(id: string): { x: number; y: number } {
  const [x, y] = id.split(',').map(Number)
  return { x, y }
}

/** The tile one character of the board string draws on cell `id`: "c" a C
 *  tile, "C" a blank played as C. */
function decodeTile(id: string, ch: string): GTile {
  const letter = ch.toLowerCase()
  return { id, letter, blank: letter !== ch }
}

/** The board's 225 cells, row by row, from the blob's `board.letters`: "." an
 *  empty cell, a letter the tile on it. */
export function decodeBoard(letters: string): GCell[] {
  return [...letters].map((ch, i) => {
    const id = makeCellId(i % BOARD_SIZE, Math.floor(i / BOARD_SIZE))
    return { id, tile: ch === '.' ? null : decodeTile(id, ch) }
  })
}

/** One of a word's placements in the log, `"x,y:c"`, as its tile. */
export function decodePlacement(placement: string): GTile {
  const [id, ch] = placement.split(':')
  return decodeTile(id, ch)
}


/** A board with no tile on it. */
export function makeEmptyBoard(): GCell[] {
  return decodeBoard('.'.repeat(BOARD_SIZE * BOARD_SIZE))
}

/**
 * The standard 15×15 premium layout, drawn as 15 rows so it reads like the
 * physical board (a quick visual diff against a real Scrabble board catches a
 * typo instantly):
 *   T = triple word · D = double word · t = triple letter · d = double letter
 *   * = the center star (scores as a double word) · . = plain
 * It's dihedrally symmetric (rows 8–14 mirror 6–0), but spelling every row out
 * is clearer than reconstructing it from a quadrant + reflections.
 */
const LAYOUT = [
  'T..d...T...d..T',
  '.D...t...t...D.',
  '..D...d.d...D..',
  'd..D...d...D..d',
  '....D.....D....',
  '.t...t...t...t.',
  '..d...d.d...d..',
  'T..d...*...d..T',
  '..d...d.d...d..',
  '.t...t...t...t.',
  '....D.....D....',
  'd..D...d...D..d',
  '..D...d.d...D..',
  '.D...t...t...D.',
  'T..d...T...d..T',
] as const

const PREMIUM_OF: Record<string, GPremiumType> = {
  T: 'TW',
  D: 'DW',
  '*': 'DW', // the center star is a double-word cell
  t: 'TL',
  d: 'DL',
  '.': 'none',
}

/** Flat length-225 premium grid, parsed once from {@link LAYOUT}. */
export const PREMIUMS: GPremiumType[] = LAYOUT.join('')
  .split('')
  .map((ch) => PREMIUM_OF[ch])

export function premiumAt(x: number, y: number): GPremiumType {
  return PREMIUMS[cellIndex(x, y)]
}

/**
 * Point value per letter. Blanks (declared or glyph) score 0 — the caller is
 * responsible for passing 0 when a cell came from a blank; this map only holds
 * the face values of the lettered tiles.
 */
export const LETTER_VALUES: Record<string, number> = {
  a: 1, e: 1, i: 1, o: 1, u: 1, l: 1, n: 1, s: 1, t: 1, r: 1,
  d: 2, g: 2,
  b: 3, c: 3, m: 3, p: 3,
  f: 4, h: 4, v: 4, w: 4, y: 4,
  k: 5,
  j: 8, x: 8,
  q: 10, z: 10,
}


/** Face value of a placed tile — 0 for a blank, the letter's value otherwise. */
export function tileValue(tile: { letter: string; blank: boolean }): number {
  return tile.blank ? 0 : LETTER_VALUES[tile.letter]!
}

/**
 * The standard 100-tile bag: tile glyph → count. `?` is the blank (×2). The
 * server builds + shuffles the bag from this; the FE only needs it to render
 * "tiles remaining" affordances and for the distribution unit-test. Mirrored by
 * the bag builder in `scrabble.create_game`.
 */
export const TILE_DISTRIBUTION: Record<string, number> = {
  [BLANK]: 2,
  e: 12, a: 9, i: 9, o: 8, n: 6, r: 6, t: 6, l: 4, s: 4, u: 4,
  d: 4, g: 3,
  b: 2, c: 2, m: 2, p: 2,
  f: 2, h: 2, v: 2, w: 2, y: 2,
  k: 1,
  j: 1, x: 1,
  q: 1, z: 1,
}


/** The full 100-tile bag as a flat array (unshuffled), for tests / reference. */
export function fullBag(): string[] {
  return Object.entries(TILE_DISTRIBUTION).flatMap(([tile, n]) =>
    Array.from({ length: n }, () => tile),
  )
}
