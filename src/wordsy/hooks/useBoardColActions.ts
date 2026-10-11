// cs-unmet

import { useBindAction } from '@/common/actions/useBindAction'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import type { GBoardColActions, GBoardColView, GGameData } from '../types'

/**
 * The board column's two commands, each the one button under a scoresheet:
 * "Start round N" under a finished round's, and "Show final scores" under the
 * last round's when the game ended in front of me. Both are button-only, with
 * no menu row and no key: each is the one thing the surface offers at that
 * moment, drawn where the board was, so there is nothing for a legend to
 * teach and nothing to reach for from elsewhere.
 */
export function useBoardColActions({
  gd,
  view,
  showFinalScores,
  localFeedbackSlot,
}: {
  gd: GGameData
  view: GBoardColView
  // `useBoardColView`'s: the step from the last round's sheet to the game's.
  showFinalScores: () => void
  // Where a refused Start says so.
  localFeedbackSlot: FeedbackSlot
}): GBoardColActions {
  // Between rounds: I am ready for the next, and the last press deals it.
  // After mine it waits on the others, grayed, until the next round arrives.
  async function startRound() {
    const res = await runRpc<{ result: 'ready' | 'started' }>(
      db.rpc('start_round', { p_game_id: gd.id }),
    )
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && (res.data.result === 'ready' || res.data.result === 'started')) {
      return
    } else {
      reportUnhandled('start_round', res)
    }
  }

  const actStartRound = useBindAction('act-start-round', {
    ended: gd.ended,
    describe: () => {
      if (view !== 'roundSheet' || !gd.me.stillPlaying) return 'hidden'
      if (gd.me.isReadyForNextRound) return { state: 'disabled', label: 'Waiting for others' }
      return { state: 'active', label: `Start round ${gd.round.num + 1}` }
    },
    run: startRound,
  })

  const actShowFinalScores = useBindAction('act-show-final-scores', {
    describe: () => (view === 'lastRoundSheet' ? 'active' : 'hidden'),
    run: showFinalScores,
  })

  return { actStartRound, actShowFinalScores }
}
