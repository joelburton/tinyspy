// cs-blessed-wordle

import type { Outcome } from '@/common/outcomes/outcomes'
import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { GAnswer } from '../types'

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
export function answerMessage(answer: GAnswer): AnswerMessage {
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
    // Red where the duplicate is amber, though both cost nothing: a duplicate
    // is a move refused for form — the word exists, it is just already there —
    // while a non-word is a wrong answer of its own kind, the one thing typed
    // at this board that is not a word.
    case 'not_a_word':
      return { outcome: 'lost', text: 'Not in word list' }
    case 'too_short':
      return { outcome: 'warning', text: 'Not enough letters' }
  }
}

/** The fields of a logged row that say what it WAS. Narrower than `GEvent` on
 *  purpose: nothing here may reach for an author, an id or the colors, which
 *  belong to the surface drawing the row. */
type LoggedGuess = { correct: boolean; word: string }

/**
 * What COLOR a logged row is — for the event log, which writes its own words
 * (the guess is five colored squares there, not a sentence).
 */
export function eventToOutcome(row: LoggedGuess): Outcome {
  return answerMessage({ answerType: row.correct ? 'correct' : 'incorrect' }).outcome
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
    answerType: row.correct ? 'correct_peer' : 'incorrect_peer',
    guess: row.word,
  })
}
