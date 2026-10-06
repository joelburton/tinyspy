// cs-unmet

import { useBindAction, type Action } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { db } from '../db'

/** What `pass_turn` answers: one `ok`, carrying the turn state the pass
 *  produced. `play_state` is where sudden death shows up — spending the last
 *  turn is a state the board renders off the games row, not a second answer to
 *  "did my pass go through". */
type PassAnswer = {
  result: 'passed'
  turn_number: number
  turns_remaining: number
  // The seat that gives the next clue; null once the pass drops the game into
  // sudden death, where nobody clues.
  clue_giver: 'A' | 'B' | null
  play_state: 'playing' | 'sudden_death'
}

/**
 * Pass & End Turn (`act-end-turn`): end the turn without another guess — legal
 * at any point in the guess phase, even before the first guess, and it spends
 * the turn like any other turn end. Bound while the Pass button is up; a
 * refused pass shows into the local slot as a not-ok.
 *
 * No `busy` flag of its own: the action's run is single-flight, so a second
 * press while the first is out is dropped.
 */
export function usePassTurn({
  gameId,
  localFeedbackSlot,
}: {
  gameId: string
  localFeedbackSlot: FeedbackSlot
}): Action {
  return useBindAction('act-end-turn', {
    describe: () => ({ state: 'active', label: 'Pass & End Turn' }),
    run: async () => {
      const res = await runRpc<PassAnswer>(db.rpc('pass_turn',
        { p_game_id: gameId }))
      if (res.type === 'not-ok') {
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'passed') {
        // Nothing to do: the new turn — and sudden death, if that was the last
        // one — arrives on the games row, which is what redraws this panel.
        return
      } else {
        reportUnhandled('pass_turn', res)
        return
      }
    },
  })
}
