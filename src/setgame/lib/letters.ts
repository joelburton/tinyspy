import { MAX_BOARD } from './cards'

/**
 * The keyboard address of each board slot.
 *
 * Two properties matter, and they pull against each other:
 *
 *   1. **Letters must read left-to-right.** People scan a row, not a column, so
 *      A B C D across the top is what a hand reaches for.
 *   2. **A letter must never change which card it means.** Dealing three cards
 *      adds a COLUMN, and two games in three do that at least once. If the
 *      letters ran A B C D / E F G H across a four-column board, growing to
 *      five would re-letter eight of the twelve cards already on the table —
 *      and a player typing from muscle memory would silently claim a card they
 *      never looked at.
 *
 * Both hold at once by lettering a FIXED 3 x 7 grid — seven being the widest
 * board that can exist — and showing only the columns currently dealt:
 *
 *      A  B  C  D  | E  F  G
 *      H  I  J  K  | L  M  N
 *      O  P  Q  R  | S  T  U
 *
 * At twelve cards the left four columns are on the table; the fifth column
 * arrives as E / L / S and disturbs nothing. The cost is that the rows are not
 * contiguous (row two starts at H, not E), which nobody has to know: a letter
 * here is an address to read off a card, never a sequence to recite.
 */

/** The widest the board can ever be — MAX_BOARD.full, as columns of three. */
const MAX_COLS = MAX_BOARD.full / 3

const ROWS = 3

/** Row-major over the fixed grid, so index = row * MAX_COLS + col. */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTU'

if (LETTERS.length < ROWS * MAX_COLS) {
  // A build-time sanity check: if the ceiling ever moves, the board would
  // silently render blank labels on its last cards.
  throw new Error(`setgame: a ${ROWS}x${MAX_COLS} grid needs ${ROWS * MAX_COLS} letters`)
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
