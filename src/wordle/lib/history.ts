// cs-unmet

/**
 * wordle — the turn-history replay. Given the guess log and the position of a turn
 * within it, reconstruct what the board looked like at that turn (the guess rows up
 * to and including it) plus which row that turn added — so PlayArea can hand
 * `<Board>` a historical `rows` list the same way it hands it the live one.
 *
 * ADD-style replay (like psychicnum/scrabble, unlike stackdown's removal): a guess
 * only ever ADDS a colored row to the board, so a past board is simply the first N
 * guess rows. No fold or mutation is needed — the rows ARE the state.
 *
 * **Keyed by log position, not a stored id.** wordle's `events` rows each carry
 * an id, but the log renders "#N" = the row's position in the DISPLAYED board
 * (0-based here), which is what a board replay indexes by. The
 * viewer only ever replays the board the player is looking at (their own / the coop
 * team board), where log position and board row line up 1:1 — see PlayArea.
 *
 * **The boundary is INCLUSIVE**: viewing the turn at `index` shows the board AFTER
 * that guess landed, with that guess's row ringed in the history blue — "this is the row
 * this turn added" (the reveal IS the event). Matches psychicnum/waffle/scrabble.
 *
 * Pure (no React / supabase) + unit-tested, parallel to the other games' lib/history.
 */
import type { EventRow } from '../hooks/useGame'

/** The board row shape `<Board rows>` renders — a guess + its g/y/x colors. */
export interface HistorySnapshotRow {
  guess: string
  colors: string
}

export interface HistorySnapshot {
  /** The guess rows as of the END of the viewed turn — feed straight to
   *  `<Board rows>` (each is `{ guess, colors }`). */
  rows: HistorySnapshotRow[]
  /** The board row this turn added — ring it in the history blue (it already wears its
   *  g/y/x tile colors). Equal to `index` (the last row in `rows`). */
  historyLitBoardRow: number
  /** A short, name-free turn label for the viewer banner (the log row shows *who*). */
  historyLabel: string
}

/**
 * Reconstruct the rows + lit board row + historyLabel for the event with this
 * `id`. Takes the guesses up to and including it (INCLUSIVE) as the board's
 * rows and rings the last one.
 *
 * Addressed by the ROW'S ID, resolved against the list being folded. The number
 * the log prints is the row's place in whatever the log is SHOWING, which a
 * filter changes; the board replays the rows it is looking at, which a filter
 * does not. Two lists, so no shared index.
 */
export function historySnapshot(
  guesses: ReadonlyArray<EventRow>,
  id: number,
): HistorySnapshot {
  // -1 when the id names a row this board does not hold — a compete opponent's
  // guess against your own board. An empty board and no ring is the honest
  // answer; there is nothing of theirs to replay here.
  const index = guesses.findIndex((g) => g.id === id)
  const turn = index >= 0 ? guesses[index] : undefined
  const rows = guesses
    .slice(0, index + 1)
    .map((g) => ({ guess: g.guess, colors: g.colors }))
  return {
    rows,
    historyLitBoardRow: index,
    historyLabel: turn ? `Guess ${index + 1}: ${turn.guess.toUpperCase()}` : 'This guess',
  }
}
