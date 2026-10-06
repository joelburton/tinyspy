// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import type { GGameData, GSolution } from '../types'

/** What `crosswords.export_solution` puts in `data`: the whole answer key. */
type ExportAnswer = { result: 'exported'; solution: GSolution }

/**
 * The answer key's trip to `crosswords.export_solution`, for Download as .ipuz
 * and the answer-key PDF — both of which need real answers before the game
 * ends, where `gd.puzzle.solution` is still null. The RPC hands any player the
 * grid at any time; when to offer it is the menu's rule. Resolves to the key,
 * or null when the trip failed and the slot has said so.
 */
export function useExportSolution({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  localFeedbackSlot: FeedbackSlot
}): {
  exportSolution: () => Promise<GSolution | null>
} {
  async function exportSolution(): Promise<GSolution | null> {
    const res = await runRpc<ExportAnswer>(db.rpc('export_solution', { p_game_id: gd.id }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return null
    } else if (res.type === 'ok' && res.data.result === 'exported') {
      return res.data.solution
    } else {
      reportUnhandled('export_solution', res)
      return null
    }
  }

  return { exportSolution }
}
