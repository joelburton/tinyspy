// cs-unmet

import { useMark } from '@/common/board-marks/useMark'
import { NO_TIMER } from '@/common/board-marks/feedbackTiming'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import type { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useWatchFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import type { Outcome } from '@/common/outcomes/outcomes'
import type { GBoardVerdict, GVerdictMark } from '../types'

/**
 * The verdict mark — the tile colors for the outcome of a guess — and how it
 * ends. One mark: four tiles in one outcome color. Who the guess was by is
 * not this hook's business: `useSubmitGuess` calls `markTiles` for a guess
 * `me` made, with the message to show beside it, and `useMarkForeignGuesses`
 * calls it for a teammate's, with none.
 *
 * A mark ends three ways. One marked with a message leaves when that message
 * leaves the local slot — a tap on the pill, a key — because the mark keeps
 * the slot entry's id and is drawn only while the entry is there. `clear()`
 * takes it off now; `BoardCol` calls that on the player's next pick. And a
 * new `markTiles` replaces it.
 */
export function useVerdictMark({ localFeedbackSlot }: {
  localFeedbackSlot: FeedbackSlot
}): GVerdictMark {
  const [verdict, showVerdict, clearVerdict] =
    useMark<GBoardVerdict & { msgId: string | null }>(NO_TIMER)

  /**
   * Color these tiles in this outcome. With a message, show it in the local
   * slot too and remember its entry, so the color leaves when the pill does;
   * with null, the color stays until the next mark or `clear()`.
   */
  function markTiles({ tileIds, outcome, message }: {
    tileIds: readonly string[]
    outcome: Outcome
    message: FeedbackMessage | null
  }) {
    const msgId = message === null ? null : localFeedbackSlot.show(message)
    showVerdict(
      { tileIds: new Set(tileIds), outcome, msgId },
      { attention: true })
  }

  // Re-renders when the slot changes, so the mark re-derives when its message
  // leaves.
  useWatchFeedbackSlot(localFeedbackSlot)
  const isMarkShown =
    verdict !== null &&
    (verdict.value.msgId === null ||
      localFeedbackSlot.peek().some((entry) => entry.id ===
        verdict.value.msgId))

  return {
    mark: isMarkShown ? verdict : null,
    markTiles,
    clear: clearVerdict,
  }
}
