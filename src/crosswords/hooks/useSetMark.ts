// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { cellKey } from '../lib/cellKey'
import type { GGameData, GMarkSide, GMarkType, GPendingWrites } from '../types'

/** What `crosswords.set_mark` puts in `data`: the revision its rebuild of the
 *  blobs wrote. */
type SetMarkAnswer = { result: 'marked'; revision: number }

/**
 * A cryptic edge mark's trip to `crosswords.set_mark`, shown at once through
 * `pendingWrites` as a typed letter is (`useSetCell`). Display-only: nothing
 * is solved by it, so it answers nothing but the revision.
 */
export function useSetMark({
  gd,
  pendingWrites,
  localFeedbackSlot,
}: {
  gd: GGameData
  pendingWrites: GPendingWrites
  localFeedbackSlot: FeedbackSlot
}): {
  setMark: (row: number, col: number, side: GMarkSide, mark: GMarkType | null) => Promise<void>
} {
  async function setMark(row: number, col: number, side: GMarkSide, mark: GMarkType | null) {
    const handle = pendingWrites.add(
      cellKey(row, col),
      side === 'right' ? { markRight: mark } : { markBottom: mark },
    )
    const res = await runRpc<SetMarkAnswer>(db.rpc('set_mark', {
      p_game_id: gd.id,
      p_row: row,
      p_col: col,
      p_side: side,
      // A nullable `text` param (null clears the edge).
      p_mark: mark as string,
    }))
    if (res.type === 'not-ok') {
      pendingWrites.drop(handle)
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'marked') {
      pendingWrites.settle(handle, res.data.revision)
      return
    } else {
      pendingWrites.drop(handle)
      reportUnhandled('set_mark', res)
      return
    }
  }

  return { setMark }
}
