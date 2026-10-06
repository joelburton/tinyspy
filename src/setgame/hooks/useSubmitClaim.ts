// cs-unmet

import { useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import type { GGameData, GTile } from '../types'

/** What `setgame.submit_set` puts in `data`. One `ok` answer, named anyway — a
 *  branch matching merely by being `ok` would draw a second one as this. A
 *  claim that ends the game says nothing more: the ending reaches the page in
 *  the next blob, like everyone else's. */
type ClaimAnswer = { result: 'claimed' }

/**
 * A claim's trip to `submit_set`, and the tiles it is carrying.
 *
 * The three tiles wear the in-flight dim from the click — before any server
 * answer — until the claim lands, when they leave the table and the claim's
 * own marks take over. On a slow link the dim IS the answer to "did it hear
 * me?". A refusal releases them: the contention race — someone was faster —
 * is the one refusal a player realistically meets, and it isn't their mistake,
 * so it shows in the pill as a not-ok.
 *
 * Nothing waits on the answer: the rest of the table stays live, so a fast
 * player can start their next set while this one travels.
 *
 *   send             claim these three tiles
 *   inFlightTileIds  the tiles of a claim still on its way, still on the table
 */
export function useSubmitClaim({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  localFeedbackSlot: FeedbackSlot
}): {
  send: (tiles: readonly GTile[]) => Promise<void>
  inFlightTileIds: ReadonlySet<string>
} {
  const [sentTileIds, setSentTileIds] = useState<readonly string[]>([])

  async function send(tiles: readonly GTile[]) {
    setSentTileIds(tiles.map((t) => t.id))
    const res = await runRpc<ClaimAnswer>(db.rpc('submit_set', {
      p_game_id: gd.id,
      p_tiles: tiles.map((t) => Number(t.id)),
    }))
    if (res.type === 'not-ok') {
      setSentTileIds([])
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'claimed') {
      // Nothing to release: the dim ends when the tiles leave the table.
      return
    } else {
      // The dim would otherwise sit on three tiles for good: an answer nobody
      // named may not have moved the table.
      setSentTileIds([])
      reportUnhandled('submit_set', res)
      return
    }
  }

  return {
    send,
    // Derived against the live table, so a claim that landed holds nothing.
    inFlightTileIds: new Set(sentTileIds.filter((id) =>
      gd.board.tilesById[id] !== undefined)),
  }
}
