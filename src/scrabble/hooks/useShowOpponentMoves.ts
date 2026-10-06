// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { answerMessage } from '../lib/answer'
import type { GAnswer, GEvent, GGameData } from '../types'

/**
 * An opponent's turn, in the header slot, once per new turn in the log — a
 * person's or a bot's, which has no one at the table to watch it move.
 *
 * Compete only. A coop table plays one board and one rack together, so a
 * teammate's word is already on everyone's board. The rows an ending writes
 * are not turns, and the game's ending says the rest.
 */
export function useShowOpponentMoves(gd: GGameData, globalFeedbackSlot: FeedbackSlot): void {
  useShowPeerFeedback({
    enabled: gd.compete,
    items: gd.events.filter((e) => e.tookTurn),
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      if (e.by === gd.me) return null
      const { outcome, text } = answerMessage(makePeerAnswer(e))
      return FeedbackMessage.peer(e.by, outcome, text)
    },
    globalFeedbackSlot,
  })
}

/** An opponent's turn, as the answer the header reads. */
function makePeerAnswer(event: GEvent): GAnswer {
  if (event.kind === 'word') {
    return { answerType: 'word_peer', words: event.words!, score: event.score! }
  } else if (event.kind === 'exchange') {
    return { answerType: 'exchange_peer', nTiles: event.nTiles! }
  } else if (event.kind === 'pass') {
    return { answerType: 'pass_peer' }
  }
  throw new Error(`BUG: a scrabble ${event.kind} row took a turn`)
}
