// cs-blessed-psychicnum

/**
 * psychicnum — the turn-history replay. Given the event log and the id of a turn
 * within it, reconstruct what the board looked like at that turn (which tiles had
 * been decided, and as what) plus which tile that turn decided — so the board can
 * draw a past turn from the same `TileResults` it draws the live board from.
 *
 * **A past board is a FOLD, because a guess only ever ADDS.** Every mark this game
 * makes is permanent, so replaying a turn is the events up to it folded into the
 * same `word → is_correct` map the live board uses — no undoing, and nothing to
 * put back. A word is guessable only once (the server refuses a repeat), so the
 * fold never overwrites. Hint and spoiler turns decide no tile, so they leave the
 * map unchanged and light nothing.
 *
 * **Whose board a turn replays is its own author's.** Mid-game compete that is
 * always me (RLS shows me nothing else), but once the game has ended every
 * player's rows arrive, and a `#N` on one of theirs has to fold THEIR guesses —
 * folding the whole table would draw a board nobody ever played. Coop is one
 * shared board, so it folds every row.
 *
 * **Addressed by the row's own id**, resolved against the list being folded. The
 * `#N` the log prints is that row's place in whatever the log is SHOWING, which a
 * filter moves; the rows the board replays are a different list, so the two
 * cannot share an index.
 *
 * **The boundary is INCLUSIVE**: viewing a turn shows the board AFTER that turn's
 * guess, with the guessed tile ringed — "this is the tile this turn decided". The
 * reveal IS the event, so a board that stopped just before it would be showing
 * the moment nothing had happened yet.
 *
 * Pure: no React, no supabase.
 */
import type { EventRow } from '../hooks/useGame'
import type { TileResults } from './tileResults'

/** A past turn, replayed. */
export type ReplayedTurn = {
  // The board as of the END of the viewed turn.
  tileResults: TileResults
  // The board word this turn's guess decided — ring it history-blue (it already
  // wears its green/red outcome color). Null for a hint / spoiler turn (no tile).
  litWord: string | null
  // A short, name-free turn label for the viewer banner (the log row shows *who*).
  label: string
  // Who made the turn — whose board this is; null for an id not in the log.
  authorId: string | null
}

/**
 * Replay the turn of the event with this `id`: fold every guess up to and
 * including it (on its author's board alone, in compete) into the tile results,
 * and light that event's own guessed word.
 */
export function replayTurn(
  events: ReadonlyArray<EventRow>,
  id: number,
  isCompete: boolean,
): ReplayedTurn {
  const viewedEvent = events.find((event) => event.id === id)
  const boardEvents =
    isCompete && viewedEvent
      ? events.filter((event) => event.user_id === viewedEvent.user_id)
      : events
  const index = boardEvents.findIndex((event) => event.id === id)
  const tileResults = new Map<string, boolean>()
  for (let i = 0; i <= index && i < boardEvents.length; i++) {
    const event = boardEvents[i]!
    if (event.kind === 'guess') tileResults.set(event.word, event.is_correct)
  }
  return {
    tileResults,
    litWord: viewedEvent && viewedEvent.kind === 'guess' ? viewedEvent.word : null,
    label: describe(viewedEvent),
    authorId: viewedEvent?.user_id ?? null,
  }
}

/** The kind-aware turn label, in the words every other surface of this game
 *  uses for the same row (`lib/answer.ts`): a guess reads as its verdict, a
 *  spoiler names the word handed over, a hint carries its clue text in `word`
 *  (never the secret — no leak). */
function describe(turn: EventRow | undefined): string {
  if (!turn) return 'This turn'
  const word = turn.word.toUpperCase()
  if (turn.kind === 'hint') return `Hint: ${turn.word}`
  if (turn.kind === 'spoiler') return `Spoiler: ${word}`
  return turn.is_correct ? `${word} — Correct` : `${word} — Wrong`
}
