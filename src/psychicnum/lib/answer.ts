// cs-blessed-psychicnum

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
  // My correct guess.
  | { answerType: 'hit'; word: string }
  // A coop teammate's, on the board we share.
  | { answerType: 'hit_peer'; word: string }

  // My wrong guess.
  | { answerType: 'miss'; word: string }
  // A coop teammate's.
  | { answerType: 'miss_peer'; word: string }

  // I asked for a clue.
  | { answerType: 'hint' }
  // A coop teammate asked for one.
  | { answerType: 'hint_peer' }

  // I asked for a secret word.
  | { answerType: 'spoiler' }
  // A coop teammate had one handed to them.
  | { answerType: 'spoiler_peer' }

  // A compete opponent's secrets-found count ticked up. It has no twin of
  // mine: this is not a row (RLS shows one racer nothing of another's) but a
  // public count.
  | { answerType: 'found_peer' }

  // Refused here: the board does not hold that word.
  | { answerType: 'not_on_board' }
  // Refused here: this board has already decided that word.
  | { answerType: 'already_guessed' }

/**
 * How an answer reads — **the one place this game decides that.** An empty
 * `text` means nothing is shown: the answer's only job is its outcome, which
 * the event log draws as the row's bar.
 */
export function answerMessage(answer: Answer): AnswerMessage {
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

    case 'not_on_board':
      return { outcome: 'lost', text: 'Not on the board' }

    case 'already_guessed':
      return { outcome: 'warning', text: 'Already guessed' }
  }
}

/** The columns of a `psychicnum.events` row that say what it WAS. Narrower
 *  than `EventRow` on purpose: nothing here may reach for an author, an id or a
 *  timestamp, which belong to the surface drawing the row. */
type LoggedEvent = {
  kind: 'guess' | 'hint' | 'spoiler'
  is_correct: boolean
  word: string
}

/**
 * What COLOR a logged row is — for the event log, which writes its own words.
 *
 * A log phrases things its own way (the word and the verdict are two columns
 * there, not a sentence), so it takes the outcome and nothing else.
 *
 * `kind` is read FIRST, and this is the trap it exists for: a hint and a
 * spoiler row are both written `is_correct = true`, so asking about the verdict
 * before asking what the row IS would read either as a correct guess.
 */
export function eventToOutcome(row: LoggedEvent): Outcome {
  if (row.kind === 'hint') return answerMessage({ answerType: 'hint' }).outcome
  if (row.kind === 'spoiler') return answerMessage({ answerType: 'spoiler' }).outcome
  return answerMessage({ answerType: row.is_correct ? 'hit' : 'miss', word: row.word }).outcome
}

/**
 * How a logged row reads when it is SOMEBODY ELSE'S — the `_peer` twin of
 * whatever it was, with the words that go in the header line.
 *
 * The caller has already established that the row is not the viewer's own (its
 * own line is the local slot's).
 */
export function peerAnswerMessage(row: LoggedEvent): AnswerMessage {
  if (row.kind === 'hint') return answerMessage({ answerType: 'hint_peer' })
  if (row.kind === 'spoiler') return answerMessage({ answerType: 'spoiler_peer' })
  return answerMessage({
    answerType: row.is_correct ? 'hit_peer' : 'miss_peer',
    word: row.word,
  })
}
