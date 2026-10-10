// cs-unmet

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { GAnswer, GEvent } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The pill,
 * the header's line about a rival and the event log's bar all read it.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a word that stands is neither good nor bad yet — nothing is scored until
 *     the round ends — so it is `neutral`.
 *   - a word not in the dictionary is the move going wrong: red. It costs
 *     nothing but the retype.
 *   - a word whose root an earlier round scored is not wrong spelling but a
 *     rule of this game, and the player may not have seen the earlier word:
 *     `warning`, naming it.
 *   - a rival's first submit starts the clock on everyone: `warning`, since
 *     what it says is "hurry".
 *   - a player with no word when the round ended scored nothing for it:
 *     `warning`, as an unspent go is in every game.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'submitted':
      return { outcome: 'neutral', text: 'Your word is in' }
    case 'not_a_word':
      return { outcome: 'lost', text: 'Not a word at this dictionary' }
    case 'already_played':
      return { outcome: 'warning', text: `Already played: ${answer.earlier.toUpperCase()}` }
    case 'first_in_peer':
      return { outcome: 'warning', text: 'submitted — 30 seconds' }
    case 'no_word':
      return { outcome: 'warning', text: 'no word' }
  }
}

/**
 * What COLOR a logged row is, for the event log: no word is the warning; a
 * word that earned a bonus is `won`, since a bonus is the round's verdict
 * between players; any other word is `neutral`.
 */
export function eventToOutcome(row: Pick<GEvent, 'word' | 'bonus'>): Outcome {
  if (row.word === '') return answerMessage({ answerType: 'no_word' }).outcome
  if (row.bonus > 0) return 'won'
  return 'neutral'
}
