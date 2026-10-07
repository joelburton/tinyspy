// cs-unmet

/**
 * wordleone — the turn-history replay. Given the starter, the guess log and a
 * turn in it, reconstruct what the board looked like at that turn, so
 * BoardCol can hand `<Board>` a historical `rows` list the same way it hands it
 * the live one.
 *
 * The board is two rows, and a turn only ever fills the second: the starter
 * stays, a miss shows its word there as it looked before it was sent — typed,
 * uncolored, unringed — and the solve shows the answer all green, ringed in
 * the history blue as the row that turn added.
 *
 * **Whose turn it is is its own author's.** Mid-game compete that is always me
 * (`useGame`'s seat rule shows me nothing else), but once the game has ended a
 * `#N` on a rival's row shows THEIR turn, named in the banner.
 *
 * Pure (no React / supabase) + unit-tested.
 */
import type { GBoardRow, GEvent, GReplayedTurn } from '../types'

/**
 * Replay the turn of the guess with this `id`: the starter, then that guess's
 * row, and the banner's label.
 *
 * Addressed by the ROW'S ID. The number the log prints is the row's place in
 * whatever the log is SHOWING, which a filter changes — which is why `n`, the
 * `#N` the log was printing on the clicked row, is passed in rather than
 * counted here. Null drops the number from the label.
 */
export function replayTurn(
  starter: GBoardRow,
  events: ReadonlyArray<GEvent>,
  id: number,
  n: number | null,
): GReplayedTurn {
  const viewedEvent = events.find((g) => g.id === id)
  if (!viewedEvent) {
    // An id the log does not hold: the starter alone, and no ring, is the
    // honest answer.
    return { rows: [starter], litRowIdx: -1, label: 'This guess', author: null }
  }
  const word = viewedEvent.word.toUpperCase()
  return {
    rows: [starter, { word: viewedEvent.word, colors: viewedEvent.colors }],
    litRowIdx: viewedEvent.correct ? 1 : -1,
    label: n === null ? word : `Guess ${n}: ${word}`,
    author: viewedEvent.by,
  }
}
