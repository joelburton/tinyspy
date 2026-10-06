// cs-unmet

import { useCallback } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import type { GGameData } from '../types'

/** What `bananagrams.peel` puts in `data`. `invalid` is an ok answer on
 *  purpose: a board that isn't win-legal is a state of play — the game keeps
 *  going and the player fixes the cells and peels again. */
type PeelResult =
  | { result: 'dealt' }
  | { result: 'won' }
  | { result: 'invalid'; invalid_cells: number[] }
  | null

/**
 * A peel's trip to `bananagrams.peel`, and what its answer shows in the local
 * slot. A blocked peel hands back the offending cells for the editing board to
 * paint red.
 *
 * The editing board calls it after saving the board, so the server judges what
 * the player sees.
 */
export function usePeel({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  localFeedbackSlot: FeedbackSlot
}): {
  // Resolves to the cells that blocked the peel, or null.
  peel: () => Promise<{ invalidCells: number[] } | null>
} {
  // A `useCallback` because the editing board holds it in its own callbacks'
  // dependencies.
  const peel = useCallback(async (): Promise<{ invalidCells: number[] } | null> => {
    const res = await runRpc<PeelResult>(db.rpc('peel', { p_game_id: gd.id }))
    if (res.type === 'not-ok') {
      // The races (the game ended, a second tab conceded) and the faults, in
      // the server's sentence; `runRpc` has already raised the modal for the
      // faults.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return null
    } else if (res.type === 'ok' && res.data?.result === 'invalid') {
      // The board isn't win-legal, so the game stays in progress and the RPC
      // hands back the offending cells for the editing board to paint red.
      const { outcome, text } = answerMessage({ answerType: 'peel_invalid' })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return { invalidCells: res.data.invalid_cells }
    } else if (res.type === 'ok' && (res.data?.result === 'dealt' || res.data?.result === 'won')) {
      // Nothing to say here: the next blob carries the draw's row, or the
      // ending, and the slot's hooks react to those.
      return null
    } else {
      reportUnhandled('peel', res)
      return null
    }
  }, [gd.id, localFeedbackSlot])

  return { peel }
}
