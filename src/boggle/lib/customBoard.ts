// NB: explicit .ts extension — the boggle-build-board edge function imports this
// module (it must not trust the client's parse), and Deno requires extensions.
// Vite/Vitest/tsc accept them too (tsconfig `allowImportingTsExtensions`).
import { faceToDisplay } from './dice.ts'

/**
 * The custom-board round trip: turning a board into the string the recap prints,
 * and turning a string a player typed back into a board.
 *
 * Both halves live here because they are one agreement. The point of the feature
 * is that you read a board you liked off the info column (or off the printout),
 * paste it into a friend's setup dialog, and get the same puzzle — so the
 * formatter's output MUST be something the parser accepts, and
 * `customBoard.test.ts` asserts exactly that over every dice set's faces.
 *
 * ── The board string ────────────────────────────────────────────────────────
 * Internally a board is a row-major string of raw FACES (`src/boggle/lib/dice.ts`):
 * `A`–`Z` for an ordinary tile, `1`–`6` for a multiface tile (1=Qu 2=In 3=Th
 * 4=Er 5=He 6=An), `0` for a blank. Players never see that encoding; they see
 * what `faceToDisplay` renders — `Qu`, `?`.
 *
 * ── Written form ────────────────────────────────────────────────────────────
 * Rows, top to bottom, separated by a space, read like English:
 *
 *     ABCD EFGH IJKL MNOP          a plain 4×4
 *     ABQuD EFGH IJKL MNO?         with a Qu tile and a blank
 *
 * ── The mixed-case rule ─────────────────────────────────────────────────────
 * A two-letter tile is recognized ONLY when written the way it prints: a capital
 * followed by a lowercase (`Qu`, `An`, `Th`). Everything else is one tile per
 * character, either case.
 *
 * That rule exists because the alternative is ambiguous, not because it's
 * tidy. A bare `Q` face is real (4×4 Classic's `ABJMOQ` die), so `QU` genuinely
 * could be one Qu tile or a Q beside a U — and the six digraphs are all common
 * letter pairs, so a player pasting sixteen lowercase letters would have `an`,
 * `in`, `he`, `th` and `er` silently swallowed into single tiles. Keying on the
 * case makes each spelling mean exactly one thing, and makes the printed form —
 * which is always `Qu`, never `QU` or `qu` — the spelling that round-trips.
 */

/** The faces a board string can hold, in raw-encoding order: blank, then the six
 *  multiface digits. `A`–`Z` are handled directly (a face IS the letter). */
const SPECIAL_FACES = ['0', '1', '2', '3', '4', '5', '6'] as const

/**
 * Written tile → raw face, derived from `faceToDisplay` rather than written out
 * a second time. The two directions can't drift into disagreement if only one of
 * them holds the table.
 */
const FACE_BY_DISPLAY: ReadonlyMap<string, string> = new Map(
  SPECIAL_FACES.map((face) => [faceToDisplay(face), face]),
)

/** How many characters we'll keep from the custom-board input. A 6×6 of nothing
 *  but two-letter tiles is 72 characters plus 5 row spaces; 128 leaves room to
 *  paste something sloppily spaced without the field silently biting the end
 *  off. Real over-length input is caught by the tile count, which can say what's
 *  actually wrong. */
export const MAX_CUSTOM_BOARD_LEN = 128

/**
 * Strip what can never be part of a board, and cap the length — the keystroke-
 * level clean the setup field applies, NOT validation. It deliberately keeps
 * case (the mixed-case rule above depends on it) and keeps spaces (they're how
 * rows stay readable), so what a player typed is what they see.
 */
export function cleanCustomBoard(raw: string): string {
  return raw.replace(/[^A-Za-z? ]/g, '').slice(0, MAX_CUSTOM_BOARD_LEN)
}

/** A board string as ROWS of written tiles — `"ABQuD EFGH IJKL MNOP"`. This is
 *  what the recap prints and what the setup field takes back. */
export function formatBoard(board: string, n: number): string {
  const rows: string[] = []
  for (let y = 0; y < n; y++) {
    let row = ''
    for (let x = 0; x < n; x++) row += faceToDisplay(board[y * n + x])
    rows.push(row)
  }
  return rows.join(' ')
}

/**
 * What a typed board read as: the raw face string, or the one-line reason it
 * couldn't be read.
 *
 * Tagged with `ok` rather than left as two optional fields so both callers can
 * narrow it the same way — the edge function typechecks under Deno's tsc, which
 * won't discriminate a union on an `error?: undefined` property.
 */
export type CustomBoardResult =
  | { ok: true; board: string }
  | { ok: false; error: string }

/**
 * Read a typed board back into a raw face string, or say why it can't be —
 * the single authority, called by the setup dialog's Start gate AND by
 * `boggle-build-board` (which must not trust the client's parse).
 *
 * Errors are ONE SHORT LINE: the dialog's validation slot is single-line
 * (nowrap + ellipsis), the same constraint freebee's `customLettersError`
 * documents.
 */
export function parseCustomBoard(text: string, n: number): CustomBoardResult {
  const faces: string[] = []
  // Whitespace is purely presentational — rows may be spaced, run together, or
  // wrapped however a paste happened to arrive.
  const s = text.replace(/\s+/g, '')
  for (let i = 0; i < s.length; ) {
    // A two-character tile, but only spelled as it prints (see the mixed-case
    // rule above): capital then lowercase.
    const pair = s.slice(i, i + 2)
    const paired = pair.length === 2 && FACE_BY_DISPLAY.get(pair)
    if (paired) {
      faces.push(paired)
      i += 2
      continue
    }
    const ch = s[i]
    const single = FACE_BY_DISPLAY.get(ch) // '?' — the blank tile
    if (single) {
      faces.push(single)
      i += 1
      continue
    }
    if (/[A-Za-z]/.test(ch)) {
      faces.push(ch.toUpperCase())
      i += 1
      continue
    }
    return { ok: false, error: `"${ch}" isn't a tile — use letters, ${twoLetterList()} or ?.` }
  }

  if (faces.length !== n * n) {
    return {
      ok: false,
      error: `A ${n}×${n} board needs ${n * n} tiles — that's ${faces.length}.`,
    }
  }
  return { ok: true, board: faces.join('') }
}

/** `Qu, In, Th, Er, He or An` — built from the same table, for the error above
 *  and for the dialog's helper copy. */
export function twoLetterList(): string {
  const written = SPECIAL_FACES.filter((f) => f !== '0').map(faceToDisplay)
  return `${written.slice(0, -1).join(', ')} or ${written[written.length - 1]}`
}
