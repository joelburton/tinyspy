// cs-unmet

import { useMemo } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { answerMessage } from '../lib/answer'
import type { GGameData } from '../types'

/**
 * In compete, show "X solved it" in the header slot the moment an opponent
 * solves — their public `solved` being set. A rival's guesses are withheld
 * until the game ends (`useGame`'s seat rule), so a solve is the one thing
 * about them this mode can narrate. Coop says nothing here: a teammate's guess
 * is narrated from the log instead.
 *
 * It wears the words a solving guess wears anywhere, the outcome following the
 * event rather than my stake in it (docs/ui.md → Feedback pill). My own solve
 * is never announced; the ending's messages cover it.
 */
export function useShowOppsSolvedMessages(
  gd: GGameData,
  myId: string,
  globalFeedbackSlot: FeedbackSlot,
): void {
  // Keyed on the players, which keep their identity across renders, so the
  // narration sees a new list only when someone's solve lands.
  const solved = useMemo(() => gd.players.filter((p) => p.solved), [gd.players])
  useShowPeerFeedback({
    enabled: gd.compete,
    items: solved,
    keyOf: (p) => p.id,
    messageFor: (p) => {
      if (p.id === myId) return null
      const { outcome, text } = answerMessage({ answerType: 'solved_peer' })
      return FeedbackMessage.peerMilestone(p, outcome, text)
    },
    globalFeedbackSlot,
  })
}
