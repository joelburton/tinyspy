// cs-unmet

import { useCallback } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import type { GGameData } from '../types'

/** What `bananagrams.check_board` puts in `data`. Three results because the
 *  check says three things — and `empty` is its own, since a board with
 *  nothing on it has no blockers and would otherwise read as clean. */
type CheckedBoard =
  | { result: 'invalid'; invalid_cells: number[] }
  | { result: 'empty' }
  | { result: 'clean' }
  | null

/**
 * **Check words**' trip to `bananagrams.check_board`, and its answer in the
 * local slot. The red cells are the real answer — the words only say how to
 * read them — so it hands back the cells that failed (none for a clean or an
 * empty board) for the editing board to paint, or null when the check itself
 * failed and the board's marks should stay as they are.
 *
 * The editing board calls it after saving the board, so the server judges what
 * the player sees.
 */
export function useCheckBoard({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  localFeedbackSlot: FeedbackSlot
}): {
  checkBoard: () => Promise<{ invalidCells: number[] } | null>
} {
  // A `useCallback` because the editing board holds it in its own callbacks'
  // dependencies.
  const checkBoard = useCallback(async (): Promise<{ invalidCells: number[] } | null> => {
    const res = await runRpc<CheckedBoard>(db.rpc('check_board', { p_game_id: gd.id }))
    if (res.type === 'not-ok') {
      // The fault's modal is already up; this is what the slot says once it
      // is dismissed.
      localFeedbackSlot.show(FeedbackMessage.result('error', `Check failed: ${res.message}`))
      return null
    } else if (res.type === 'ok' && res.data?.result === 'invalid') {
      const nTiles = res.data.invalid_cells.length
      const { outcome, text } = answerMessage({ answerType: 'check_invalid', nTiles })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return { invalidCells: res.data.invalid_cells }
    } else if (res.type === 'ok' && res.data?.result === 'empty') {
      const { outcome, text } = answerMessage({ answerType: 'check_empty' })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return { invalidCells: [] }
    } else if (res.type === 'ok' && res.data?.result === 'clean') {
      const { outcome, text } = answerMessage({ answerType: 'check_clean' })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return { invalidCells: [] }
    } else {
      reportUnhandled('check_board', res)
      return null
    }
  }, [gd.id, localFeedbackSlot])

  return { checkBoard }
}
