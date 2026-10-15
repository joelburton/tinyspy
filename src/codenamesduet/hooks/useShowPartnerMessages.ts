// cs-unmet

import { useEffect } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { answerMessage, turnAnswer } from '../lib/answer'
import type { GGameData } from '../types'

/**
 * What my PARTNER is doing, in the header slot — about somebody else, which is
 * what puts it in the global slot rather than the local one (docs/ui.md →
 * Feedback pill). Two kinds:
 *
 * - **Where the turn stands** — writing a clue, guessing mine, waiting on me —
 *   in `lib/answer.ts`'s words, held while it is true: news in the header
 *   covers it and it comes back as the news fades.
 * - **My partner asked the AI for a clue, or declined to give clues**, once,
 *   as it lands; my own is not, since the suggestion dialog and the clue seat
 *   leaving me say it. Old ones are not replayed on load; see
 *   `useShowPeerFeedback`.
 */
export function useShowPartnerMessages(gd: GGameData, globalFeedbackSlot: FeedbackSlot) {
  // Derived to primitives so a reload's fresh `partner` object does not re-show
  // the line.
  const partnerAnswer = turnAnswer({
    isClueIn: gd.turns.currClue !== null,
    isClueGiver: gd.me.clueGiver,
    suddenDeath: gd.me.suddenDeath,
    isGameEnded: gd.ended,
  })
  const partnerMessage = partnerAnswer === null ? null : answerMessage(
    partnerAnswer)
  const partnerText = partnerMessage?.text ?? null
  const partnerOutcome = partnerMessage?.outcome ?? null
  const partnerName = gd.partner.username
  const partnerColor = gd.partner.color

  useEffect(function showPartnerStatus() {
      if (partnerText === null || partnerOutcome === null) return
      const id = globalFeedbackSlot.show(
        FeedbackMessage.peerStatus({ username: partnerName, color: partnerColor },
          partnerText,
          {
            outcome: partnerOutcome,
          }),
      )
      return () => globalFeedbackSlot.retract(id)
    },
    [globalFeedbackSlot, partnerText, partnerOutcome, partnerName, partnerColor])

  useShowPeerFeedback({
    enabled: true,
    items: gd.events,
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      if (e.by === gd.me) return null
      if (e.kind !== 'hint' && e.kind !== 'decline') return null
      const { outcome, text } = answerMessage({
        answerType: e.kind === 'hint' ? 'hint_peer' : 'declined_peer',
      })
      return FeedbackMessage.peer(e.by, outcome, text)
    },
    globalFeedbackSlot,
  })
}
