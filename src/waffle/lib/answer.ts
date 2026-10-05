// cs-unmet

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { GAnswer } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The event
 * log's bar and a rival's header line read it. An empty `text` means nothing is
 * shown: the answer's only job there is its outcome.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - **a swap is `neutral`**: a turn that counted and that nothing
 *     adjudicates. Whether it helped is what the tiles' colors say, in waffle's
 *     own vocabulary, not this one.
 *   - **a rival's solve is `won` and running out is `warning`**: the outcome
 *     follows the event, not my stake in it (docs/ui.md → Feedback pill).
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    // Coop says nothing about a teammate's swap: the swap log shows every move.
    case 'swapped_peer':
      return { outcome: 'neutral', text: '' }
    case 'solved_peer':
      return { outcome: 'won', text: 'solved it' }
    case 'out_of_swaps_peer':
      return { outcome: 'warning', text: 'out of swaps' }
  }
}

/** What COLOR a swap in the log is — for the event log, which writes its own
 *  words. Every row is a swap. */
export function eventToOutcome(): Outcome {
  return answerMessage({ answerType: 'swapped_peer' }).outcome
}
