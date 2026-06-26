/**
 * scrabble (codename `scrabble`) — the board + tile *constants*.
 *
 * Unlike the board-library games (stackdown, FreeBee), scrabble's board
 * layout and tile distribution never vary between games — they're the standard
 * Scrabble constants, hard-coded here. The premium-square grid is FE-only: the
 * server never scores (trusting commit — see play.ts), so it has no need for it.
 * The only thing mirrored SQL-side is the bag distribution + letter values that
 * `create_game`'s bag builder and end-game leftover scoring need. The only
 * per-game randomness is the bag's shuffle order. This module is the FE's half
 * of the rules; `play.ts` builds the geometry + scoring on top of it. Both are
 * pure (no React, no Supabase) so they're cheap to unit-test and safe to share.
 *
 * See docs/games/scrabble.md §3 for the model.
 */

export const BOARD_SIZE = 15
export const RACK_SIZE = 7
export const BINGO_BONUS = 50
/** The center square index (7,7) — the first play must cover it. */
export const CENTER = 7 * BOARD_SIZE + 7
/** The rack/bag glyph for a blank tile (a wild that's declared on play). */
export const BLANK = '?'

/** Flat board index from (x, y). x = column, y = row; both 0..14. */
export const cellIndex = (x: number, y: number) => y * BOARD_SIZE + x
export const inBounds = (x: number, y: number) =>
  x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE

/**
 * A placed board square: a letter glyph (uppercase A–Z) plus whether it came
 * from a blank tile (which scores 0 but still reads as `l` for word-building).
 * The board is a flat length-225 array of `Cell | null` (null = empty square),
 * stored verbatim as the `scrabble.games.board` jsonb. `b` / `l` are kept short
 * because they ride on the wire in every board cell.
 */
export type Cell = { l: string; b: boolean } | null

export type PremiumType = 'none' | 'DL' | 'TL' | 'DW' | 'TW'

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

const PREMIUM_OF: Record<string, PremiumType> = {
  T: 'TW',
  D: 'DW',
  '*': 'DW', // the center star is a double-word square
  t: 'TL',
  d: 'DL',
  '.': 'none',
}

/** Flat length-225 premium grid, parsed once from {@link LAYOUT}. */
export const PREMIUMS: PremiumType[] = LAYOUT.join('')
  .split('')
  .map((ch) => PREMIUM_OF[ch])

export const premiumAt = (x: number, y: number): PremiumType =>
  PREMIUMS[cellIndex(x, y)]

/**
 * Point value per letter. Blanks (declared or glyph) score 0 — the caller is
 * responsible for passing 0 when a cell came from a blank; this map only holds
 * the face values of the lettered tiles.
 */
export const LETTER_VALUES: Record<string, number> = {
  A: 1, E: 1, I: 1, O: 1, U: 1, L: 1, N: 1, S: 1, T: 1, R: 1,
  D: 2, G: 2,
  B: 3, C: 3, M: 3, P: 3,
  F: 4, H: 4, V: 4, W: 4, Y: 4,
  K: 5,
  J: 8, X: 8,
  Q: 10, Z: 10,
}

/** Face value of a placed cell — 0 for a blank, the letter's value otherwise. */
export const cellValue = (cell: { l: string; b: boolean }): number =>
  cell.b ? 0 : (LETTER_VALUES[cell.l] ?? 0)

/**
 * The standard 100-tile bag: tile glyph → count. `?` is the blank (×2). The
 * server builds + shuffles the bag from this; the FE only needs it to render
 * "tiles remaining" affordances and for the distribution unit-test. Mirrored by
 * the bag builder in `scrabble.create_game`.
 */
export const TILE_DISTRIBUTION: Record<string, number> = {
  [BLANK]: 2,
  E: 12, A: 9, I: 9, O: 8, N: 6, R: 6, T: 6, L: 4, S: 4, U: 4,
  D: 4, G: 3,
  B: 2, C: 2, M: 2, P: 2,
  F: 2, H: 2, V: 2, W: 2, Y: 2,
  K: 1,
  J: 1, X: 1,
  Q: 1, Z: 1,
}

/** The full 100-tile bag as a flat array (unshuffled), for tests / reference. */
export const fullBag = (): string[] =>
  Object.entries(TILE_DISTRIBUTION).flatMap(([tile, n]) =>
    Array.from({ length: n }, () => tile),
  )
