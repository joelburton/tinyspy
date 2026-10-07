// cs-unmet

import { MAX_BOARD } from './tiles'

/**
 * The keyboard address of each board slot.
 *
 * Two properties matter, and they pull against each other:
 *
 *   1. **Letters must sit where the hand is.** Each board row is a keyboard
 *      row, read left to right: Q W E R across the top, A S D F under it, Z X C V
 *      under that, so a tile's key is where the tile is.
 *   2. **A letter must never change which tile it means.** Dealing three tiles
 *      adds a COLUMN, and two games in three do that at least once. If the
 *      letters ran A B C D / E F G H across a four-column board, growing to
 *      five would re-letter eight of the twelve tiles already on the table —
 *      and a player typing from muscle memory would silently claim a tile they
 *      never looked at.
 *
 * Both hold at once by lettering a FIXED 3 x 7 grid — seven being the widest
 * board that can exist — and showing only the columns currently dealt:
 *
 *      Q  W  E  R  | T  Y  U
 *      A  S  D  F  | G  H  J
 *      Z  X  C  V  | B  N  M
 *
 * At twelve tiles the left four columns are on the table; the fifth column
 * arrives as T / G / B and disturbs nothing.
 */

/** The widest the board can ever be — MAX_BOARD.full, as columns of three. */
const MAX_COLS = MAX_BOARD.full / 3

const ROWS = 3

/** Row-major over the fixed grid, so index = row * MAX_COLS + col. */
const LETTERS = 'QWERTYUASDFGHJZXCVBNM'

if (LETTERS.length < ROWS * MAX_COLS) {
  // A build-time sanity check: if the ceiling ever moves, the board would
  // silently render blank labels on its last tiles.
  throw new Error(
    `setgame: a ${ROWS}x${MAX_COLS} grid needs ${ROWS * MAX_COLS} letters`)
}

/**
 * The letter for a 0-based slot index.
 *
 * The board array is COLUMN-major — slot 0,1,2 are the first column top to
 * bottom, which is the order a deal appends in — so the slot has to be
 * transposed into the row-major letter grid here.
 */
export function letterForSlot(slot: number): string {
  const row = slot % ROWS
  const col = Math.floor(slot / ROWS)
  return LETTERS[row * MAX_COLS + col] ?? ''
}

/** The slot a typed key addresses, or -1. Case-insensitive. */
export function slotForKey(key: string): number {
  if (key.length !== 1) return -1
  const at = LETTERS.indexOf(key.toUpperCase())
  if (at < 0) return -1
  const row = Math.floor(at / MAX_COLS)
  const col = at % MAX_COLS
  return col * ROWS + row
}
