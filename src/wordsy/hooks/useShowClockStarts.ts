// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { answerMessage } from '../lib/answer'
import type { GGameData } from '../types'

/**
 * A rival's word starting the round's clock, in the header slot: "● bea
 * submitted — 30 seconds". It is the flip of the rulebook's timer, the one
 * thing another player does that changes what I must do, so it is said once
 * per round as the round's Fastest appears; a rival's later submits are not
 * news. Mine is not narrated: I pressed ↵.
 *
 * The timer style only: in no-timer the First Wordsmith is named at the deal,
 * and nothing anyone submits starts a clock.
 */
export function useShowClockStarts(gd: GGameData, globalFeedbackSlot: FeedbackSlot): void {
  useShowPeerFeedback({
    enabled: gd.setup.round_style === 'timer',
    items: gd.rounds.filter((r) => r.fastest !== null),
    keyOf: (r) => String(r.num),
    messageFor: (r) => {
      if (r.fastest === gd.me) return null
      const { outcome, text } = answerMessage({ answerType: 'first_in_peer' })
      return FeedbackMessage.peer(r.fastest!, outcome, text)
    },
    globalFeedbackSlot,
  })
}
