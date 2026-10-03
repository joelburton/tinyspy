// cs-blessed-psychicnum

import { getGuessOutcome } from './answer'
import type { GEvent, GReplayedTurn, GTile } from '../types'

/**
 * psychicnum — the turn-history replay: the board as it stood after a given
 * turn, as the same `GTile[]` the live board is drawn from.
 *
 * A past board is the guesses up to and including the viewed turn, folded onto
 * the puzzle's words; every mark is permanent and no word is guessed twice, so
 * nothing is undone or overwritten. Hint and spoiler turns decide no tile. In
 * compete a turn replays its author's board — their guesses alone, as the
 * board they played — and coop is one shared board, so it folds every row.
 *
 * A turn is addressed by its row's id, not by the `#N` the log prints: that
 * number is the row's place in whatever the log is showing, which a filter
 * moves.
 */

/**
 * Replay the turn of the event with this `id`: fold every guess up to and
 * including it (on its author's board alone, in compete) onto the puzzle's
 * words, and light that event's own guessed word.
 */
export function replayTurn(
  events: ReadonlyArray<GEvent>,
  words: readonly string[],
  id: number,
  isCompete: boolean,
): GReplayedTurn {
  const viewedEvent = events.find((event) => event.id === id)
  const boardEvents =
    isCompete && viewedEvent
      ? events.filter((event) => event.by === viewedEvent.by)
      : events
  const index = boardEvents.findIndex((event) => event.id === id)
  const guessOf = new Map<string, GEvent>()
  for (let i = 0; i <= index && i < boardEvents.length; i++) {
    const event = boardEvents[i]!
    if (event.kind === 'guess') guessOf.set(event.word, event)
  }
  const tiles: GTile[] = words.map((word) => {
    const guess = guessOf.get(word)
    return guess === undefined
      ? { word, correct: null, outcome: null, decidedBy: null }
      : { word, correct: guess.correct, outcome: getGuessOutcome(word, guess.correct), decidedBy: guess.by }
  })
  return {
    tiles,
    litWord: viewedEvent && viewedEvent.kind === 'guess' ? viewedEvent.word : null,
    label: describe(viewedEvent),
    author: viewedEvent?.by ?? null,
  }
}

/** The kind-aware turn label, in the words every other surface of this game
 *  uses for the same row (`lib/answer.ts`): a guess reads as its verdict, a
 *  spoiler names the word handed over, a hint carries its clue text in `word`
 *  (never the secret — no leak). */
function describe(turn: GEvent | undefined): string {
  if (!turn) return 'This turn'
  const word = turn.word.toUpperCase()
  if (turn.kind === 'hint') return `Hint: ${turn.word}`
  if (turn.kind === 'spoiler') return `Spoiler: ${word}`
  return turn.correct ? `${word} — Correct` : `${word} — Wrong`
}
