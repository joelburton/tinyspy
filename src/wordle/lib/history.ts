// cs-blessed-wordle

/**
 * wordle — the turn-history replay. Given the guess log and a turn in it,
 * reconstruct what the board looked like at that turn (the guess rows up to
 * and including it) plus which row that turn added — so BoardCol can hand
 * `<Board>` a historical `rows` list the same way it hands it the live one.
 *
 * ADD-style replay: a guess only ever ADDS a colored row to the board, so a
 * past board is simply the first N guess rows. No fold or mutation is needed —
 * the rows ARE the state.
 *
 * **Whose board a turn replays is its own author's.** Mid-game compete that is
 * always me (`useGame`'s seat rule shows me nothing else), but once the game
 * has ended every player's rows arrive, and a `#N` on one of theirs replays
 * THEIR board — replaying the whole table would draw a board nobody ever
 * played. Coop is one shared board, so it replays every row.
 *
 * **The boundary is INCLUSIVE**: viewing a turn shows the board AFTER that
 * guess landed, with that guess's row ringed in the history blue — "this is the
 * row this turn added" (the reveal IS the event).
 *
 * Pure (no React / supabase) + unit-tested.
 */
import type { GEvent, GReplayedTurn } from '../types'

/**
 * Replay the turn of the guess with this `id`: its author's guesses (every
 * guess, in coop) up to and including it as the rows, the last one ringed, and
 * the banner's label.
 *
 * Addressed by the ROW'S ID, resolved against the rows being replayed. The
 * number the log prints is the row's place in whatever the log is SHOWING,
 * which a filter changes; the board replays its author's rows, which a filter
 * does not. Two lists, so no shared index — which is why `n`, the `#N` the log
 * was printing on the clicked row, is passed in rather than counted here. Null
 * drops the number from the label.
 */
export function replayTurn(
  events: ReadonlyArray<GEvent>,
  id: number,
  n: number | null,
  isCompete: boolean,
): GReplayedTurn {

  const viewedEvent = events.find((g) => g.id === id)
  const boardEvents =
    isCompete && viewedEvent
      ? events.filter((g) => g.by === viewedEvent.by)
      : events

  // -1 when the id names no row in the log: an empty board and no ring is the
  // honest answer.
  const index = boardEvents.findIndex((g) => g.id === id)
  const rows = boardEvents
    .slice(0, index + 1)
    .map((g) => ({ word: g.word, colors: g.colors }))

  return {
    rows,
    litRowIdx: index,
    label: !viewedEvent
      ? 'This guess'
      : n === null
        ? viewedEvent.word.toUpperCase()
        : `Guess ${n}: ${viewedEvent.word.toUpperCase()}`,
    author: viewedEvent?.by ?? null,
  }
}
