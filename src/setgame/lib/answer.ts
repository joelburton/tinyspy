// cs-fixed-outcome-fix

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { GAnswer, GEvent } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The pill,
 * the header's teammate line and the event log's bar all read it. An empty
 * `text` means nothing is shown: the answer's only job there is its outcome.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a claim that lands has no pill — the tiles leaving the board are the
 *     answer — so its `won` is read by the log, by the ring on the found set,
 *     and by a teammate's line.
 *   - a hint is spent whether or not you then go on to see the set, which is
 *     neither good nor bad play: `warning`, as a hint is in every game. It has
 *     no pill either: the ring it draws is the answer.
 *   - three tiles that are not a set cost you the pick, not the game. It is
 *     still the move going wrong, so it wears red.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'claim':
      return { outcome: 'won', text: '' }
    case 'claim_peer':
      return { outcome: 'won', text: 'found a set' }
    case 'hint':
      return { outcome: 'warning', text: '' }
    case 'not_a_set':
      return { outcome: 'lost', text: 'Not a set' }
  }
}

/**
 * What COLOR a logged row is — for the event log, which writes its own words:
 * a claim is won, a hint is a hint.
 */
export function eventToOutcome(row: Pick<GEvent, 'kind'>): Outcome {
  return answerMessage({ answerType: row.kind }).outcome
}
