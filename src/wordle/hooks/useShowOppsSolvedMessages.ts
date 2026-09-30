// cs-unmet

import { useMemo } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { answerMessage } from '../lib/answer'
import type { GameData } from './useGame'

/**
 * In compete, show "X solved it" in the header slot the moment an opponent
 * solves — their public `solved_at` being set. RLS hides an opponent's guesses
 * until the game ends, so a solve is the one thing about them this mode can
 * narrate. Coop says nothing here: a teammate's guess is narrated from the log
 * instead.
 *
 * It wears the words a solving guess wears anywhere, the outcome following the
 * event rather than my stake in it (docs/ui.md → Feedback pill). My own solve
 * is never announced; the ending's messages cover it.
 */
export function useShowOppsSolvedMessages(
  gd: GameData,
  selfId: string,
  globalFeedbackSlot: FeedbackSlot,
): void {
  // Keyed on the players, which keep their identity across renders, so the
  // narration sees a new list only when someone's solve lands.
  const solvedIds = useMemo(
    () => Object.values(gd.playersById).filter((p) => p.solvedAt !== null).map((p) => p.user_id),
    [gd.playersById],
  )
  usePeerFeedback({
    enabled: gd.isCompete,
    items: solvedIds,
    keyOf: (id) => id,
    messageFor: (id) => {
      if (id === selfId) return null
      const { outcome, text } = answerMessage({ answerType: 'solved_peer' })
      // The id came from `playersById` itself, so the lookup cannot miss.
      return FeedbackMessage.peerMilestone(gd.playersById[id]!, outcome, text)
    },
    globalFeedbackSlot,
  })
}
