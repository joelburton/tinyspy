// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { db } from '../db'

/** What `decline_clue_giving` answers: one `ok`, carrying who clues now. */
type DeclineAnswer = {
  result: 'declined'
  // The partner's seat; null when they may not clue either, and sudden death
  // has begun.
  clue_giver: 'A' | 'B' | null
}

/**
 * Decline clues (`act-decline-clue-giving`): give no clue, this turn or any
 * later one, when the setup's `can_decline_clue_giving` allows it. No turn is
 * spent; the partner takes the clue seat for the rest of the game, or, when
 * they may not clue either, sudden death begins. Bound while the clue form is
 * up; a refused decline shows into the local slot as a not-ok.
 *
 * `isClueOut` is the form's own clue being with the server: the button waits
 * for it, as the AI button does.
 */
export function useDeclineClueGiving({
  gameId,
  isAllowed,
  isClueOut,
  localFeedbackSlot,
}: {
  gameId: string
  // The setup allows it. Off, the button is not drawn.
  isAllowed: boolean
  isClueOut: boolean
  localFeedbackSlot: FeedbackSlot
}): Action {
  return useBindAction('act-decline-clue-giving', {
    describe: () => {
      if (!isAllowed) return 'hidden'
      return {
        state: isClueOut ? 'disabled' : 'active',
        tooltip: 'Decline to give clues for rest of game',
      }
    },
    run: async () => {
      const res = await runRpc<DeclineAnswer>(db.rpc('decline_clue_giving',
        { p_game_id: gameId }))
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'declined') {
        // Nothing to do: the clue seat moving to my partner — or sudden death —
        // arrives on the games row, which is what takes the form away.
        return
      } else {
        reportUnhandled('decline_clue_giving', res)
        return
      }
    },
  })
}
