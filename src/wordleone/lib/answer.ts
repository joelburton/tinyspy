// cs-unmet

import type { Outcome } from '@/common/outcomes/outcomes'
import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { GAnswer } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** An empty
 * `text` means nothing is shown: my own solve says nothing, because the green
 * row that lands IS the feedback.
 *
 * The reading: a miss is a wrong answer. It comes back with no colors — it
 * tells you only that it was wrong — so it is `lost`, red, where wordle's
 * colored guess is `neutral`. The soft rejects read as wordle's do.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'correct':
      return { outcome: 'won', text: '' }
    case 'correct_peer':
      return { outcome: 'won', text: `guessed ${answer.guess.toUpperCase()}` }

    case 'miss':
      return { outcome: 'lost', text: 'Not it' }
    case 'miss_peer':
      return { outcome: 'lost', text: `guessed ${answer.guess.toUpperCase()} — not it` }

    case 'solved_peer':
      return { outcome: 'won', text: 'solved it' }

    case 'duplicate':
      return { outcome: 'warning', text: 'Already guessed' }
    // Red where the duplicate is amber, though both cost nothing: a duplicate
    // is a move refused for form — the word exists, it is just already there —
    // while a non-word is a wrong answer of its own kind.
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
 * (the guess is five squares there, not a sentence).
 */
export function eventToOutcome(row: LoggedGuess): Outcome {
  return answerMessage({ answerType: row.correct ? 'correct' : 'miss' }).outcome
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
    answerType: row.correct ? 'correct_peer' : 'miss_peer',
    guess: row.word,
  })
}
