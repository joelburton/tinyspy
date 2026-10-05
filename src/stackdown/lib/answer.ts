// cs-fixed-outcome-fix

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { GAnswer, GEvent } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The pill, the
 * entry slots, a teammate's tiles, the header's teammate line and the event
 * log's bar all read it. An empty `text` means nothing is shown: the answer's
 * only job there is its outcome.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - the board only ever exposes the six solution words, so a refused word is
 *     not a near miss or a dictionary quarrel — it is the wrong word, and it
 *     costs the turn.
 *   - a hint is a nudge you asked for and paid for, which is neither good nor
 *     bad play: `warning`, as a hint is in every game. A spoiler hands over the
 *     word itself, which ends the hunt for it — that is a loss, and it wears
 *     red.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'accepted':
      return { outcome: 'won', text: '' }
    case 'accepted_peer':
      return { outcome: 'won', text: `found ${answer.word.toUpperCase()}` }

    // The sentence names the word because by the time it is read the tiles are
    // back on the board and the word has left the slots.
    case 'invalid':
      return { outcome: 'lost', text: `Not a word: ${answer.word.toUpperCase()}` }
    // "tried X", not "tried X — not a word": the header fits ~26 characters on
    // a phone and ellipsizes silently, and the outcome already says it failed.
    case 'invalid_peer':
      return { outcome: 'lost', text: `tried ${answer.word.toUpperCase()}` }

    case 'hint':
      return { outcome: 'warning', text: `Hint: ${answer.clue}` }
    case 'hint_peer':
      return { outcome: 'warning', text: 'revealed a hint' }

    case 'spoiler':
      return { outcome: 'lost', text: `Next word: ${answer.word.toUpperCase()}` }
    case 'spoiler_peer':
      return { outcome: 'lost', text: 'took a spoiler' }
  }
}

/** The columns of a log row that say what it WAS. */
type LoggedEvent = Pick<GEvent, 'kind' | 'valid' | 'word'>

/**
 * What COLOR a logged row is — for the event log, which writes its own words.
 *
 * `kind` is read FIRST because a request row leaves `valid` null — asking about
 * the verdict before asking what the row is would read a hint as a refused word.
 */
export function eventToOutcome(row: LoggedEvent): Outcome {
  return answerMessage(peerAnswerOf(row)).outcome
}

/**
 * Which answer a logged row is when it is a TEAMMATE's — the caller has
 * already established that it is not the viewer's own — read kind first (see
 * `eventToOutcome`). A teammate's hint and spoiler carry no content, so a
 * spoiler a teammate took never spoils the word for me.
 */
export function peerAnswerOf(row: LoggedEvent): GAnswer {
  if (row.kind === 'hint') return { answerType: 'hint_peer' }
  if (row.kind === 'spoiler') return { answerType: 'spoiler_peer' }
  // Every word row names its word.
  return row.valid
    ? { answerType: 'accepted_peer', word: row.word! }
    : { answerType: 'invalid_peer', word: row.word! }
}
