// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { answerMessage } from '../lib/answer'
import type { GGameData } from '../types'

/**
 * A teammate's claim, in the header slot, once per new claim in the log.
 *
 * Free-for-all coop only. In compete the opponent strip already ticks, and a
 * line for every rival claim would be a running commentary on the one activity
 * that needs concentration. In turn-by-turn coop it is redundant: the waiting
 * line renaming itself IS the news that the previous player claimed. A hint a
 * teammate asked for is not narrated; the log has it.
 */
export function useShowTeammateMoves(gd: GGameData, globalFeedbackSlot: FeedbackSlot): void {
  useShowPeerFeedback({
    enabled: gd.coop && gd.turns === null,
    items: gd.events.filter((e) => e.kind === 'claim'),
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      if (e.by === gd.me) return null
      const { outcome, text } = answerMessage({ answerType: 'claim_peer' })
      return FeedbackMessage.peer(e.by, outcome, text)
    },
    globalFeedbackSlot,
  })
}
