// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { IconExchange } from '@/common/icons/icons'
import { answerMessage, answerOfEvent } from '../lib/answer'
import type { GGameData } from '../types'

/** Held a little longer than an acknowledgment's default: a sentence read at
 *  a glance between moves. */
const HOLD_MS = 2500

/**
 * A draw, in the below-board slot, once per new row in the log: a peel (mine,
 * or a rival's, which dealt me a tile too) and my own dump. A rival's dump
 * changed nothing of mine, and going out is the ending's to say.
 *
 * The rows are a stream, so the shared seen-set watches them and never replays
 * the backlog on mount; the slot it shows into is this game's local one.
 */
export function useShowDrawMessages(gd: GGameData, localFeedbackSlot: FeedbackSlot): void {
  useShowPeerFeedback({
    enabled: true,
    items: gd.events,
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      const answer = answerOfEvent(e, gd.me)
      if (answer.answerType === 'went_out') return null
      if (answer.answerType === 'dump' && e.by !== gd.me) return null
      const { outcome, text } = answerMessage(answer)
      // The dump's glyph matches the dump zone's; a rival's peel leads with
      // their name, since the pill names nobody on its own here.
      const node =
        answer.answerType === 'dump'
          ? <><IconExchange
            size={14}
            aria-hidden
            style={{ verticalAlign: '-2px' }}
          /> {text}</>
          : answer.answerType === 'peel_peer'
            ? `${e.by.username} ${text}`
            : text
      return FeedbackMessage.acknowledgment(outcome, node, { ms: HOLD_MS })
    },
    globalFeedbackSlot: localFeedbackSlot,
  })
}
