// Explicit `.ts`, unlike the rest of the FE tree: the letterboxed-build-board
// edge function imports this file directly, and Deno resolves no extensions.
// Same reason boggle's customBoard.ts writes `./dice.ts`.
import { BOARD_SIZE, SIDE_SIZE } from './board.ts'

/**
 * A board as TEXT — the form a player can read off the screen, retype into the
 * setup dialog, and hand to a friend. Pure string work, no React and no
 * network, which is what lets the Deno edge function import this file directly
 * (`supabase/functions/letterboxed-build-board/index.ts`) instead of keeping a
 * second copy of the reading rules. Same seam boggle's `lib/customBoard.ts` has.
 *
 * ── The one fact that makes this trivial ────────────────────────────────────
 * `sides` is ALREADY stored in the order a person reads the board: `layout()`
 * walks group 0 across the top left-to-right, group 1 down the right, group 2
 * along the bottom RIGHT-TO-LEFT, and group 3 up the left BOTTOM-TO-TOP. That
 * is a clockwise circuit starting at the top-left letter.
 *
 * So formatting is pure chunking — no reordering, no lookup table — and
 * `parseSides(formatSides(s)) === s` for every board. What you read off the
 * board is what you type back in, and you get the same puzzle: the same
 * letters on the same sides in the same positions.
 */

/** A typed board that could be read, or the one-line reason it couldn't. */
export type ParsedSides = { ok: true; sides: string } | { ok: false; error: string }

/**
 * Normalise typed input the way the server will read it: lowercased, stripped
 * of everything that isn't an ASCII letter, capped at twelve.
 *
 * The strip is what lets a player paste a board in whatever shape they found
 * it — `ABC-DEF-GHI-JKL` (what the app itself writes, in the title, the setup
 * recap and the PDF), or four space-separated triples, or a middot-separated
 * title from a game started before 2026-08-12 — all clean to the same twelve
 * letters. That last case is the point of being liberal here rather than
 * demanding one separator: an old board is exactly the kind you want to
 * re-share.
 *
 * IT DOES NOT TRUNCATE, unlike spellingbee's `cleanLetters` and wordiply's
 * `cleanBase`. Those cap at their letter count because the field they back
 * holds the cleaned value, so a cap is a visible hard stop — the extra letter
 * never appears. This field shows what you TYPED (separators and all), so a
 * cap here would be silent: the box would read `ABC-DEF-GHI-JKLM` while the
 * game started on the first twelve. Length is `parseSides`' to judge and to
 * name, and Start stays disabled until it's right.
 */
export function cleanSides(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * A board as `ABC-DEF-GHI-JKL` — four sides of three, clockwise from the
 * top-left letter, which is exactly `sides`' own order (see the file header).
 *
 * Used by the setup recap row (which the info column and the PDF both render
 * from one array) and by the setup dialog's section summary. NOT used on the
 * input itself: the field shows the normalised letters as typed, because
 * reformatting under a moving cursor is worse than reading a plain string.
 *
 * Chunks whatever it is given rather than assuming twelve, so a half-typed
 * board summarises honestly as `ABC-DE` instead of throwing.
 */
export function formatSides(sides: string): string {
  const groups: string[] = []
  for (let i = 0; i < sides.length; i += SIDE_SIZE) {
    groups.push(sides.slice(i, i + SIDE_SIZE))
  }
  return groups.join('-').toUpperCase()
}

/**
 * Read a typed board, or say why it can't be read.
 *
 * SHAPE ONLY — twelve distinct letters. Whether those letters are a board this
 * game can prove solvable is a seed-table question the frontend can't answer
 * without a round trip, so the edge function owns it and rejects at Start (the
 * same division wordiply's `customBaseError` makes against its own builder).
 *
 * Errors are one line each: the dialog's validation slot is single-line
 * (nowrap + ellipsis).
 */
export function parseSides(raw: string): ParsedSides {
  const sides = cleanSides(raw)
  // One message for both directions, naming the count actually read: with the
  // field showing raw text, "that's 13" is the only way a player can tell a
  // stray keystroke from a missing one.
  if (sides.length !== BOARD_SIZE) {
    return { ok: false, error: `A board needs ${BOARD_SIZE} letters — that's ${sides.length}.` }
  }
  // Letter Boxed never repeats a letter, and the board relies on it: a repeated
  // letter would sit on two sides at once, so `sideOf` could not answer which.
  if (new Set(sides).size !== BOARD_SIZE) {
    return { ok: false, error: 'A board never repeats a letter.' }
  }
  return { ok: true, sides }
}
