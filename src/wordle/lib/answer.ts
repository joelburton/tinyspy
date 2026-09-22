// cs-met-wordle

import type { Outcome } from '@/common/outcomes/outcomes'
import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'

/**
 * Everything that can be SAID about a move in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * "_peer" versions are answers that come from subscriptions and are for peer
 * feedback.
 */
export type Answer =
  // My guess was the word.
  | { answerType: 'correct' }
  // A coop teammate's was, on the board we share.
  | { answerType: 'correct_peer'; guess: string }

  // My guess was not the word: it colored, and spent a go.
  | { answerType: 'incorrect' }
  // A coop teammate's did.
  | { answerType: 'incorrect_peer'; guess: string }

  // A compete opponent solved it. It has no twin of mine: this is not a row
  // (RLS shows one racer nothing of another's) but their `solved` flag.
  | { answerType: 'solved_peer' }

  // Refused by the server: this word is already on the board.
  | { answerType: 'duplicate' }
  // Refused by the server: not in the legal slice of the dictionary.
  | { answerType: 'not_a_word' }
  // Refused here: fewer than five letters.
  | { answerType: 'too_short' }

/**
 * How an answer reads — **the one place this game decides that.** An empty
 * `text` means nothing is shown: my own accepted guess says nothing, because
 * the colored row that lands IS the feedback, and the answer's only job is its
 * outcome, which the event log draws as the row's bar.
 *
 * The reading, which is this game's rather than the vocabulary's: a guess that
 * did not solve the board is NOT a bad move. You are meant to spend guesses —
 * the colors it comes back with are the whole mechanism, and a five-letter word
 * that rules out four letters has done its job. So it is `neutral`: a turn that
 * counted and that nothing adjudicates.
 */
export function answerMessage(answer: Answer): AnswerMessage {
  switch (answer.answerType) {
    case 'correct':
      return { outcome: 'won', text: '' }
    case 'correct_peer':
      return { outcome: 'won', text: `guessed ${answer.guess.toUpperCase()}` }

    case 'incorrect':
      return { outcome: 'neutral', text: '' }
    case 'incorrect_peer':
      return { outcome: 'neutral', text: `guessed ${answer.guess.toUpperCase()}` }

    case 'solved_peer':
      return { outcome: 'won', text: 'solved it' }

    case 'duplicate':
      return { outcome: 'warning', text: 'Already guessed' }
    case 'not_a_word':
      return { outcome: 'lost', text: 'Not in word list' }
    case 'too_short':
      return { outcome: 'warning', text: 'Not enough letters' }
  }
}

/** The columns of a `wordle.events` row that say what it WAS. Narrower than
 *  `EventRow` on purpose: nothing here may reach for an author, an id or the
 *  colors, which belong to the surface drawing the row. */
type LoggedGuess = { is_correct: boolean; guess: string }

/**
 * What COLOR a logged row is — for the event log, which writes its own words
 * (the guess is five colored squares there, not a sentence).
 */
export function eventToOutcome(row: LoggedGuess): Outcome {
  return answerMessage({ answerType: row.is_correct ? 'correct' : 'incorrect' }).outcome
}

/**
 * How a logged row reads when it is SOMEBODY ELSE'S — the `_peer` twin of
 * whatever it was, with the words that go in the header line.
 *
 * The caller has already established that the row is not the viewer's own (its
 * own line is the local slot's).
 */
export function peerAnswerMessage(row: LoggedGuess): AnswerMessage {
  return answerMessage({
    answerType: row.is_correct ? 'correct_peer' : 'incorrect_peer',
    guess: row.guess,
  })
}
