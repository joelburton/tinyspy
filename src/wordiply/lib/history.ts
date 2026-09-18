// cs-unmet

/**
 * wordiply's board, as it stood at one row of the log.
 *
 * The board here is five slots, and only an accepted word fills one — so
 * replaying is a filter, not a fold: the accepted words written at or before the
 * chosen row, in order. Nothing is ever taken back (a wordiply guess is
 * permanent), so there is no state to carry forward beyond the list itself.
 *
 * **A rejected row is openable too**, and shows the board WITHOUT it: a reject
 * occupies no slot, so the honest answer to "what did the board look like when I
 * tried ZZZZ?" is the accepted words that came before it. That is the one thing
 * this viewer is for — wordiply's log is mostly rejects, and the board alone
 * never says what was tried.
 *
 * Addressed by the ROW'S ID, resolved against the list being folded — the number
 * the log prints counts what the log is SHOWING, which a filter moves.
 *
 * Pure (no React / supabase) + unit-tested, parallel to the other games'
 * lib/history.
 */
import type { EventRow } from '../hooks/useGame'

/** A board row: the word and its length, which is what `<GuessBoard>` draws. */
export interface HistoryGuess {
  word: string
  length: number
}

export interface HistorySnapshot {
  /** The five-slot board's filled rows, at and including the viewed event. */
  rows: HistoryGuess[]
  /** The banner's one line — what this event was. */
  historyLabel: string
}

/** What the banner says for one row, by what the row turned out to be. */
function describe(row: EventRow | undefined): string {
  if (!row) return 'This guess'
  const word = row.word.toUpperCase()
  if (row.valid) return `${word} — ${row.length} letters`
  switch (row.reason) {
    case 'too_short':
      return `${word} — too short`
    case 'missing_base':
      return `${word} — no starter word`
    default:
      return `${word} — not a word`
  }
}

/**
 * The board as it stood at the event with this `id`, plus that event's label.
 * An id the list does not hold — a compete opponent's row, against your own
 * board — replays nothing.
 */
export function historySnapshot(
  rows: readonly EventRow[],
  id: number,
): HistorySnapshot {
  const index = rows.findIndex((r) => r.id === id)
  const row = index >= 0 ? rows[index] : undefined
  return {
    rows:
      index >= 0
        ? rows
          .slice(0, index + 1)
          .filter((r) => r.valid)
          .map((r) => ({ word: r.word, length: r.length }))
        : [],
    historyLabel: describe(row),
  }
}
