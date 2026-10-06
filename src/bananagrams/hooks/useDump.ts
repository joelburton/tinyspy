// cs-unmet

import { useCallback } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import type { GGameData } from '../types'

/** What `bananagrams.dump` puts in `data`. One answer: the swap either happens
 *  or is refused, and the new hand arrives with the next blob. */
type DumpResult = { result: 'dumped' } | null

/**
 * A dump's trip to `bananagrams.dump`: one tile traded for three. A dump that
 * lands says nothing here, since the next blob carries its row and
 * `useShowDrawMessages` acknowledges it; a refusal shows the server's sentence
 * in the local slot.
 */
export function useDump({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  localFeedbackSlot: FeedbackSlot
}): {
  dump: (tile: string) => Promise<void>
} {
  // A `useCallback` because the editing board holds it in its own callbacks'
  // dependencies.
  const dump = useCallback(
    async (tile: string) => {
      const res = await runRpc<DumpResult>(db.rpc('dump', { p_game_id: gd.id, p_tile: tile }))
      if (res.type === 'ok' && res.data?.result === 'dumped') {
        // Nothing to say: the next blob carries the dump's row.
      } else if (res.type === 'not-ok') {
        // The races (the game ended, a second tab conceded, a rival drained the
        // bunch, the server's hand disagrees with the screen) and the faults.
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
      } else {
        reportUnhandled('dump', res)
      }
    },
    [gd.id, localFeedbackSlot],
  )

  return { dump }
}
