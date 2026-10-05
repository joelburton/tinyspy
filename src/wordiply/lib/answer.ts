// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'
import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { WordSubmitReport } from '@/shared/found-words/useFoundWordSubmit'
import type { GAnswer, GEvent } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The pill,
 * the board row the word was typed into, the header's peer line and the event
 * log's bar all read it.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a word the list does not know is a MISS, not a bad move — you are hunting
 *     for the longest word you can think of, and the list may be at fault or it
 *     may have been a typo. So is a word you already used: nothing happened.
 *   - too short, and a word without the base in it, are RULES. Breaking one
 *     costs a turn like any other move, so it reads like a move that lost.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'accepted':
      return { outcome: 'won', text: '' }
    // No verb: the dot names who, the word is the news, the count is its
    // length. "played" earned no room in the header's ~26 phone characters.
    case 'accepted_peer':
      return { outcome: 'won', text: `${answer.word.toUpperCase()} (${answer.length})` }

    case 'already_found':
      return { outcome: 'warning', text: `${answer.word.toUpperCase()} — already found` }
    case 'not_a_word':
      return { outcome: 'warning', text: `${answer.word.toUpperCase()} — not a word` }

    case 'too_short':
      return { outcome: 'lost', text: `${answer.word.toUpperCase()} — too short` }
    case 'missing_base':
      return { outcome: 'lost', text: `${answer.word.toUpperCase()} — must contain "${answer.base.toUpperCase()}"` }
  }
}

/**
 * Which of this game's answers the engine's report is. The engine reports one
 * `not_legal` for two different things, and which one it was decides whether a
 * word was a miss or a rule broken: the base says which.
 *
 * `base` is empty until the game has loaded.
 */
export function answerOf(report: WordSubmitReport, base: string): GAnswer {
  const word = report.word
  switch (report.answer) {
    case 'accepted':
      return { answerType: 'accepted' }
    case 'already_found':
      return { answerType: 'already_found', word }
    case 'too_short':
      return { answerType: 'too_short', word }
    case 'not_legal':
      return base !== '' && !word.includes(base.toLowerCase())
        ? { answerType: 'missing_base', word, base }
        : { answerType: 'not_a_word', word }
  }
}

/** The fields of a logged row that say what it WAS. */
type LoggedGuess = Pick<GEvent, 'word' | 'valid' | 'reason'>

/**
 * What COLOR a logged row is — for the event log, which writes its own words
 * (a length, or a one-word reason). A rejected row with no reason is the
 * dictionary's refusal, the server's default.
 */
export function eventToOutcome(row: LoggedGuess): Outcome {
  if (row.valid) return answerMessage({ answerType: 'accepted' }).outcome
  switch (row.reason ?? 'not_a_word') {
    case 'too_short':
      return answerMessage({ answerType: 'too_short', word: row.word }).outcome
    // The row does not carry the base, and the color does not need it.
    case 'missing_base':
      return answerMessage({ answerType: 'missing_base', word: row.word, base: '' }).outcome
    case 'not_a_word':
      return answerMessage({ answerType: 'not_a_word', word: row.word }).outcome
  }
}

/**
 * How a logged row reads when it is a TEAMMATE's accepted guess, with the words
 * that go in the header line. The caller has already established that the row
 * is not the viewer's own.
 */
export function peerAnswerMessage(row: LoggedGuess): AnswerMessage {
  return answerMessage({ answerType: 'accepted_peer', word: row.word, length: row.word.length })
}
