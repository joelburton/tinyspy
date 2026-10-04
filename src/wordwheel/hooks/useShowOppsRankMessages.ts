// cs-unmet

import { useEffect, useRef } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { answerMessage } from '../lib/answer'
import type { GGameData } from '../types'

/**
 * In compete, show "reached Amazing" in the header slot the moment a rival
 * climbs a rank — their `rankIdx` on the player going up. A rival's finds are
 * withheld until the game ends (the seat rule), so a rank climbed is the one
 * thing about them this mode can narrate. Coop says nothing here: a
 * teammate's find is narrated from the found words instead.
 *
 * A delta detector rather than a seen-set, since a rank can be reached again
 * after a Restart: the first render seeds each player's rank so history is not
 * replayed. A `peerMilestone`, since a climb is where a player STANDS
 * (docs/ui.md → Feedback pill). My own rank is the RankBar's.
 */
export function useShowOppsRankMessages(
  gd: GGameData,
  globalFeedbackSlot: FeedbackSlot,
): void {
  // Each player's rank as last seen; null until the first render has seeded it.
  const seenRanksRef = useRef<Map<string, number> | null>(null)
  useEffect(function announceRankClimbs() {
    if (!gd.compete) return
    const seen = seenRanksRef.current
    seenRanksRef.current = new Map(gd.players.map((p) => [p.id, p.rankIdx]))
    if (seen === null) return
    for (const p of gd.players) {
      if (p.id === gd.me.id) continue
      if (p.rankIdx > (seen.get(p.id) ?? 0)) {
        const { outcome, text } = answerMessage({
          answerType: 'reached_peer',
          rank: p.rankName,
        })
        globalFeedbackSlot.show(FeedbackMessage.peerMilestone(p, outcome, text))
      }
    }
  }, [gd.compete, gd.players, gd.me.id, globalFeedbackSlot])
}
