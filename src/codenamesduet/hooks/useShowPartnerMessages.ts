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
 * - **My partner asked the AI for a clue**, once, as it lands; my own hint is
 *   not, since the suggestion dialog is its feedback. Old hints are not
 *   replayed on load; see `useShowPeerFeedback`.
 */
export function useShowPartnerMessages(gd: GGameData, globalFeedbackSlot: FeedbackSlot) {
  // Derived to primitives so a reload's fresh `partner` object does not re-show
  // the line.
  const partnerAnswer = turnAnswer({
    isClueIn: gd.turns.currClue !== null,
    isClueGiver: gd.me.clueGiver,
    suddenDeath: gd.team.suddenDeath,
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
      if (e.kind !== 'hint' || e.by === gd.me) return null
      const { outcome, text } = answerMessage({ answerType: 'hint_peer' })
      return FeedbackMessage.peer(e.by, outcome, text)
    },
    globalFeedbackSlot,
  })
}
