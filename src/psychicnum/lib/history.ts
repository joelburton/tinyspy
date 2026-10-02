// cs-blessed-psychicnum

/**
 * psychicnum — the turn-history replay: the board as it stood after a given
 * turn, in the same `TileResults` the live board is drawn from.
 *
 * A past board is the guesses up to and including the viewed turn, folded into
 * one `word → correct` map; every mark is permanent and no word is guessed
 * twice, so nothing is undone or overwritten. Hint and spoiler turns decide no
 * tile. In compete a turn replays its author's board — their guesses alone, as
 * the board they played — and coop is one shared board, so it folds every row.
 *
 * A turn is addressed by its row's id, not by the `#N` the log prints: that
 * number is the row's place in whatever the log is showing, which a filter
 * moves.
 */
import type { PsychicnumEvent, PsychicnumPlayer } from '../hooks/useGame'
import type { TileResults, TileWord } from './tileResults'

/** A past turn, replayed. */
export type ReplayedTurn = {
  // The board as of the END of the viewed turn.
  tileResults: TileResults
  // The board word this turn's guess decided — ring it history-blue (it already
  // wears its green/red outcome color). Null for a hint / spoiler turn (no tile).
  litWord: TileWord | null
  // A short, name-free turn label for the viewer banner (the log row shows *who*).
  label: string
  // Who made the turn — whose board this is; null for an id not in the log.
  author: PsychicnumPlayer | null
}

/**
 * Replay the turn of the event with this `id`: fold every guess up to and
 * including it (on its author's board alone, in compete) into the tile results,
 * and light that event's own guessed word.
 */
export function replayTurn(
  events: ReadonlyArray<PsychicnumEvent>,
  id: number,
  isCompete: boolean,
): ReplayedTurn {
  const viewedEvent = events.find((event) => event.id === id)
  const boardEvents =
    isCompete && viewedEvent
      ? events.filter((event) => event.by === viewedEvent.by)
      : events
  const index = boardEvents.findIndex((event) => event.id === id)
  const tileResults = new Map<string, boolean>()
  for (let i = 0; i <= index && i < boardEvents.length; i++) {
    const event = boardEvents[i]!
    if (event.kind === 'guess') tileResults.set(event.word, event.correct)
  }
  return {
    tileResults,
    litWord: viewedEvent && viewedEvent.kind === 'guess' ? viewedEvent.word : null,
    label: describe(viewedEvent),
    author: viewedEvent?.by ?? null,
  }
}

/** The kind-aware turn label, in the words every other surface of this game
 *  uses for the same row (`lib/answer.ts`): a guess reads as its verdict, a
 *  spoiler names the word handed over, a hint carries its clue text in `word`
 *  (never the secret — no leak). */
function describe(turn: PsychicnumEvent | undefined): string {
  if (!turn) return 'This turn'
  const word = turn.word.toUpperCase()
  if (turn.kind === 'hint') return `Hint: ${turn.word}`
  if (turn.kind === 'spoiler') return `Spoiler: ${word}`
  return turn.correct ? `${word} — Correct` : `${word} — Wrong`
}
