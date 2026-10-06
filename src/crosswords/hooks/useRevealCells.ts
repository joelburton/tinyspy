// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import type { GCellPos, GGameData } from '../types'

/** What `crosswords.reveal_cells` puts in `data`. `solved` matters to the
 *  server — a reveal can complete the grid and end the game — and the ending
 *  reaches the page in the blob. */
type RevealAnswer = { result: 'revealed'; solved: boolean }

/**
 * A reveal's trip to `crosswords.reveal_cells` (coop only). The letters arrive
 * in the blob, written as mine, so teammates see them flash in my color
 * (`useTeammateFills`); the reveal says nothing more (`lib/answer.ts`).
 */
export function useRevealCells({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  localFeedbackSlot: FeedbackSlot
}): {
  revealCells: (cells: GCellPos[]) => Promise<void>
} {
  async function revealCells(cells: GCellPos[]) {
    if (cells.length === 0) return
    localFeedbackSlot.dismiss()
    const res = await runRpc<RevealAnswer>(
      db.rpc('reveal_cells', { p_game_id: gd.id, p_cells: cells }),
    )
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'revealed') {
      return
    } else {
      reportUnhandled('reveal_cells', res)
      return
    }
  }

  return { revealCells }
}
