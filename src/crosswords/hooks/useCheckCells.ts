// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import { makeCellId } from '../lib/cellId'
import type { GBoard, GCellPos, GGameData } from '../types'

/** What `crosswords.check_cells` puts in `data`. The flags themselves arrive in
 *  the blob. */
type CheckAnswer = { result: 'checked' }

/**
 * A check's trip to `crosswords.check_cells`. The flagged cells arrive in the
 * blob and the grid marks them red, which is the check's answer; the slot adds
 * only that penciled cells were skipped (`lib/answer.ts`).
 *
 * @param board  the board as drawn, which says which asked cells are penciled
 */
export function useCheckCells({
  gd,
  board,
  localFeedbackSlot,
}: {
  gd: GGameData
  board: GBoard
  localFeedbackSlot: FeedbackSlot
}): {
  checkCells: (cells: GCellPos[]) => Promise<void>
} {
  async function checkCells(cells: GCellPos[]) {
    if (cells.length === 0) return
    localFeedbackSlot.dismiss()
    const res = await runRpc<CheckAnswer>(
      db.rpc('check_cells', { p_game_id: gd.id, p_cells: cells }),
    )
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'checked') {
      // A given has no place on the board, so its lookup misses.
      const skippedPencil = cells.some((p) => {
        const cell = board.cellsById[makeCellId(p.row, p.col)]
        return cell !== undefined && cell.pencil && cell.fill !== null
      })
      const { outcome, text } = answerMessage({ answerType: 'checked', skippedPencil })
      if (text) localFeedbackSlot.show(FeedbackMessage.acknowledgment(outcome, text))
      return
    } else {
      reportUnhandled('check_cells', res)
      return
    }
  }

  return { checkCells }
}
