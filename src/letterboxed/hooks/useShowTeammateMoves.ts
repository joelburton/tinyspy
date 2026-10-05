// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { answerMessage, peerAnswerOf } from '../lib/answer'
import type { GGameData } from '../types'

/**
 * In coop the chain is shared, so a teammate's move changes MY board: say so in
 * the header slot, once per new row of the log. Compete says nothing here — a
 * rival's rows are withheld mid-race, and their solve ends the race, which the
 * ending's message says.
 *
 * A teammate's hint or spoiler is TWO messages (Joel, 2026-08-05): the header
 * names the act ("● joel got a hint"), and the CONTENT — the same pill the
 * asker saw — lands in my own slot, so a hint one player asks for is a hint the
 * whole team has. Showing into the local slot from `messageFor` is sound: it
 * runs once per NEW row, inside the shared hook's effect, never during render.
 */
export function useShowTeammateMoves(
  gd: GGameData,
  globalFeedbackSlot: FeedbackSlot,
  localFeedbackSlot: FeedbackSlot,
): void {
  useShowPeerFeedback({
    enabled: gd.coop,
    items: gd.events,
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      if (e.by === gd.me) return null
      if (e.kind === 'hint' || e.kind === 'spoiler') {
        // The content, the same pill the asker saw. Every hint and spoiler row
        // names the word it showed.
        const content = answerMessage({ answerType: e.kind, word: e.word! })
        localFeedbackSlot.show(FeedbackMessage.hint(content.outcome, content.text))
      }
      const { outcome, text } = answerMessage(peerAnswerOf(e))
      return FeedbackMessage.peer(e.by, outcome, text)
    },
    globalFeedbackSlot,
  })
}
