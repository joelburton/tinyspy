// cs-unmet

import { useMemo } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import type { GGameData } from '../types'

/**
 * In compete, show it in the header slot the moment a rival leaves the race by
 * solving or by running out of swaps — their `ending.reason`, as the server
 * wrote it. A rival's swaps and board are withheld until the game ends
 * (`useGame`'s seat rule), so their ending is what this mode can narrate. Coop
 * says nothing here: the swap log already shows every move.
 *
 * A solve wears `won` and running out `warning`: the outcome follows the event,
 * not my stake in it (docs/ui.md → Feedback pill). My own ending is never
 * announced here; the ending's messages cover it.
 */
export function useShowOppsEndedMessages(
  gd: GGameData,
  globalFeedbackSlot: FeedbackSlot,
): void {
  // Keyed on the players, which keep their identity across renders, so the
  // narration sees a new list only when someone's ending lands.
  const ended = useMemo(
    () => gd.players.filter((p) =>
      p.ending?.reason === 'reached_goal'
      ||
      p.ending?.reason === 'resource_exhausted'),
    [gd.players],
  )
  useShowPeerFeedback({
    enabled: gd.compete,
    items: ended,
    keyOf: (p) => p.id,
    messageFor: (p) => {
      if (p === gd.me) return null
      return p.ending!.reason === 'reached_goal'
        ? FeedbackMessage.peerMilestone(p, 'won', 'solved it')
        : FeedbackMessage.peerMilestone(p, 'warning', 'out of swaps')
    },
    globalFeedbackSlot,
  })
}
