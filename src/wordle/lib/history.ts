// cs-met-wordle

/**
 * wordle — the turn-history replay. Given the guess log and a turn in it,
 * reconstruct what the board looked like at that turn (the guess rows up to
 * and including it) plus which row that turn added — so PlayArea can hand
 * `<Board>` a historical `rows` list the same way it hands it the live one.
 *
 * ADD-style replay: a guess only ever ADDS a colored row to the board, so a
 * past board is simply the first N guess rows. No fold or mutation is needed —
 * the rows ARE the state.
 *
 * **The boundary is INCLUSIVE**: viewing a turn shows the board AFTER that
 * guess landed, with that guess's row ringed in the history blue — "this is the
 * row this turn added" (the reveal IS the event).
 *
 * Pure (no React / supabase) + unit-tested.
 */
import type { EventRow } from '../hooks/useGame'

/** The board row shape `<Board rows>` renders — a guess + its g/y/x colors. */
export interface HistorySnapshotRow {
  guess: string
  colors: string
}

export interface HistorySnapshot {
  // The guess rows as of the END of the viewed turn — feed straight to
  // `<Board rows>` (each is `{ guess, colors }`).
  rows: HistorySnapshotRow[]
  // The board row this turn added — ring it in the history blue (it already
  // wears its g/y/x tile colors). The last row in `rows`; -1 when nothing was
  // replayed.
  historyLitBoardRow: number
  // A short, name-free turn label for the viewer banner (the log row shows *who*).
  historyLabel: string
}

/**
 * The board at the turn with this `id`: the guesses up to and including it as
 * the rows, the last one ringed, and the banner's label.
 *
 * Addressed by the ROW'S ID, resolved against the list being folded — the rows
 * of whoever wrote that row, which PlayArea picks. The number the log prints is
 * the row's place in whatever the log is SHOWING, which a filter changes; the
 * board replays the rows it is looking at, which a filter does not. Two lists,
 * so no shared index — which is why `n`, the `#N` the log was printing on the
 * clicked row, is passed in rather than counted here. Null drops the number
 * from the label.
 */
export function historySnapshot(
  guesses: ReadonlyArray<EventRow>,
  id: number,
  n: number | null,
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
    historyLabel: !turn
      ? 'This guess'
      : n === null
        ? turn.guess.toUpperCase()
        : `Guess ${n}: ${turn.guess.toUpperCase()}`,
  }
}
