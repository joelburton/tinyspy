// cs-unmet

/**
 * wordiply's board, as it stood at one row of the log.
 *
 * The board here is five lines, and only an accepted word fills one — so
 * replaying is a filter, not a fold: the accepted words written at or before the
 * chosen row, in order. Nothing is ever taken back (a wordiply guess is
 * permanent), so there is no state to carry forward beyond the list itself.
 *
 * **A rejected row is openable too**, and shows the board WITHOUT it: a reject
 * occupies no line, so the honest answer to "what did the board look like when I
 * tried ZZZZ?" is the accepted words that came before it. That is the one thing
 * this viewer is for — wordiply's log is mostly rejects, and the board alone
 * never says what was tried.
 *
 * Addressed by the ROW'S ID, resolved against the log — the number the log
 * prints counts what the log is SHOWING, which a filter moves.
 *
 * Pure (no React / supabase) + unit-tested, parallel to the other games'
 * lib/history.
 */
import type { GEvent, GReplayedTurn } from '../types'

/** What the banner says for one row, by what the row turned out to be. */
function makeLabel(row: GEvent | undefined): string {
  if (!row) return 'This guess'
  const word = row.word.toUpperCase()
  if (row.valid) return `${word} — ${row.word.length} letters`
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
 * The board as it stood at the row with this `id`, plus that row's label and
 * author. In compete each racer has their own board, so the replay is the
 * author's: their rows alone. Coop is one shared board. An id the log does not
 * hold replays nothing.
 */
export function replayTurn(
  events: readonly GEvent[],
  id: number,
  isCompete: boolean,
): GReplayedTurn {
  const row = events.find((e) => e.id === id)
  if (!row) return { words: [], label: makeLabel(undefined), author: null }

  const authorRows = isCompete ? events.filter((e) => e.by === row.by) : events
  const index = authorRows.indexOf(row)
  return {
    words: authorRows
      .slice(0, index + 1)
      .filter((e) => e.valid)
      .map((e) => e.word),
    label: makeLabel(row),
    author: row.by,
  }
}
