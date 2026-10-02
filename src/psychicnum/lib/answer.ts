// cs-blessed-psychicnum

import type { Outcome } from '@/common/outcomes/outcomes'
import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { GAnswer, GTileWord } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** An empty
 * `text` means nothing is shown: the answer's only job is its outcome, which
 * the event log draws as the row's bar.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'hit':
    case 'hit_peer':
      return { outcome: 'won', text: `Correct: ${answer.word.toUpperCase()}` }

    case 'miss':
    case 'miss_peer':
      return { outcome: 'lost', text: `Wrong: ${answer.word.toUpperCase()}` }

    case 'hint':
      return { outcome: 'warning', text: '' }
    case 'hint_peer':
      return { outcome: 'warning', text: 'got hint' }

    case 'spoiler':
      return { outcome: 'lost', text: '' }
    case 'spoiler_peer':
      return { outcome: 'lost', text: 'got spoiler' }

    case 'found_peer':
      return { outcome: 'won', text: 'guessed a word' }

    case 'already_guessed':
      return { outcome: 'warning', text: 'Already guessed' }
  }
}

/** The columns of a `psychicnum.events` row that say what it WAS. Narrower
 *  than `GEvent` on purpose: nothing here may reach for an author, an id or a
 *  timestamp, which belong to the surface drawing the row. */
type LoggedEvent = {
  kind: 'guess' | 'hint' | 'spoiler'
  correct: boolean
  word: string
}

/**
 * What COLOR a logged row is — for the event log, which writes its own words.
 *
 * A log phrases things its own way (the word and the verdict are two columns
 * there, not a sentence), so it takes the outcome and nothing else.
 *
 * `kind` is read FIRST, and this is the trap it exists for: a hint and a
 * spoiler row are both written `correct = true`, so asking about the verdict
 * before asking what the row IS would read either as a correct guess.
 */
export function eventToOutcome(row: LoggedEvent): Outcome {
  if (row.kind === 'hint') return answerMessage({ answerType: 'hint' }).outcome
  if (row.kind === 'spoiler') return answerMessage({ answerType: 'spoiler' }).outcome
  return getGuessOutcome(row.word, row.correct)
}

/** What COLOR a guessed word is — the board's decided tile, and the log's
 *  guess row, from the same answer. */
export function getGuessOutcome(word: GTileWord, isCorrect: boolean): Outcome {
  return answerMessage({ answerType: isCorrect ? 'hit' : 'miss', word }).outcome
}

/**
 * How a logged row reads when it is SOMEBODY ELSE'S — the `_peer` twin of
 * whatever it was, with the words that go in the header line.
 *
 * The caller has already established that the row is not the viewer's own (its
 * own line is the local slot's). A peer's spoiler reads without the word —
 * `spoiler_peer` carries none — so a teammate's spoiler never spoils the
 * answer for me.
 */
export function peerAnswerMessage(row: LoggedEvent): AnswerMessage {
  if (row.kind === 'hint') return answerMessage({ answerType: 'hint_peer' })
  if (row.kind === 'spoiler') return answerMessage({ answerType: 'spoiler_peer' })
  return answerMessage({
    answerType: row.correct ? 'hit_peer' : 'miss_peer',
    word: row.word,
  })
}
