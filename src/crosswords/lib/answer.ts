// cs-unmet

import type { AnswerMessage } from '@/common/feedback/FeedbackMessage'
import type { GAnswer } from '../types'

/**
 * How an answer reads — **the one place this game decides that.** The
 * below-board slot reads it after a check and a reveal. An empty `text` means
 * nothing is shown: the grid already carries the answer.
 *
 *   - a **check** marks its wrong cells red, and says nothing more — unless
 *     penciled cells were in its scope, which a check skips (a penciled letter
 *     is a guess, not an answer), so an unmarked pencil cell must not read as
 *     correct: `noted`.
 *   - a **reveal** fills its cells, which is the whole answer.
 */
export function answerMessage(answer: GAnswer): AnswerMessage {
  switch (answer.answerType) {
    case 'checked':
      return answer.skippedPencil
        ? { outcome: 'noted', text: 'Check skips pencil marks' }
        : { outcome: 'neutral', text: '' }
    case 'revealed':
      return { outcome: 'neutral', text: '' }
  }
}
