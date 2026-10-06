// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { makeCellId } from '../lib/cellId'
import type { GGameData, GPendingWrites } from '../types'

/** What `crosswords.set_cell` puts in `data`: the revision its rebuild of the
 *  blobs wrote. A solve's ending arrives in the blob. */
type SetCellAnswer = { result: 'set'; revision: number }

/**
 * A keystroke's trip to `crosswords.set_cell`: the letter shows at once
 * through `pendingWrites`, and leaves it once the blob carries it (or at once,
 * if the server refuses). The two refusals a keystroke can meet are races — a
 * teammate finished the grid, or my own concede landed — and they say so in
 * the local slot.
 */
export function useSetCell({
  gd,
  pendingWrites,
  localFeedbackSlot,
}: {
  gd: GGameData
  pendingWrites: GPendingWrites
  localFeedbackSlot: FeedbackSlot
}): {
  setCell: (row: number, col: number, fill: string | null, pencil: boolean) => Promise<void>
} {
  async function setCell(row: number, col: number, fill: string | null, pencil: boolean) {
    // A keystroke is the player's next move.
    localFeedbackSlot.dismiss()
    const penciled = pencil && fill !== null
    const handle = pendingWrites.add(makeCellId(row, col), {
      fill,
      pencil: penciled,
      wrong: false,
      // A coop cell names who filled it; a racer's grid has one writer.
      writer: gd.coop && fill !== null ? gd.me : null,
    })
    const res = await runRpc<SetCellAnswer>(db.rpc('set_cell', {
      p_game_id: gd.id,
      p_row: row,
      p_col: col,
      // A nullable `text` param (null clears the cell); the generated arg type
      // is non-null, and PostgREST passes the null through.
      p_fill: fill as string,
      p_pencil: penciled,
    }))
    if (res.type === 'not-ok') {
      pendingWrites.drop(handle)
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'set') {
      pendingWrites.settle(handle, res.data.revision)
      return
    } else {
      // An answer we cannot read: the letter is a guess about a write we cannot
      // confirm happened, so it goes.
      pendingWrites.drop(handle)
      reportUnhandled('set_cell', res)
      return
    }
  }

  return { setCell }
}
