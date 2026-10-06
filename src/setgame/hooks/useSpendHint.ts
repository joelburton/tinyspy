// cs-unmet

import { useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { nextHint, ringFromLog } from '../lib/hint'
import { CLAIM_SIZE } from '../lib/picks'
import type { GGameData, GTile } from '../types'

/** What `setgame.record_hint` puts in `data`. `n_hints_used` is the tally after
 *  this press, unread here: the state line reads the counts off `gd`. */
type HintAnswer = { result: 'recorded'; n_hints_used: number }

/**
 * The coop hint (`lib/hint.ts`): computed HERE, recorded on the server.
 *
 * The board is face-up and `lib/tiles.ts` holds the same algebra the server
 * does, so a hint is a local search — the ring lands on the keystroke rather
 * than after a round trip, which matters because it also PICKS the tiles. The
 * server is told afterwards: it charges the asker and writes the log row,
 * because the ring is transient while the ASKING is history.
 *
 * The ring is kept until a claim — anyone's — moves the table; a hint, which
 * is what asking again writes, leaves it alone. It starts from the log, so a
 * reload restores the last hint I asked for.
 *
 *   ringTiles  the tiles the ring is on, still on the table
 *   spend      the next rung: one tile, then two, then all three — which picks
 *              a set and claims it
 */
export function useSpendHint({
  gd,
  setPicks,
  submitClaim,
  localFeedbackSlot,
}: {
  gd: GGameData
  // Pick these tiles, as the ring's rung shows them.
  setPicks: (tileIds: readonly string[]) => void
  submitClaim: (tiles: readonly GTile[]) => Promise<void>
  localFeedbackSlot: FeedbackSlot
}): {
  ringTiles: GTile[]
  spend: () => Promise<void>
} {
  const nClaims = gd.events.filter((e) => e.kind === 'claim').length
  const [ringTileIds, setRingTileIds] = useState<readonly string[]>(
    () => ringFromLog(gd.events, gd.me.id).map((t) => t.id))
  // A claim moves the table, so it clears the ring — set during render, so
  // the cleared ring lands with the table that cleared it.
  const [ringClaims, setRingClaims] = useState(nClaims)
  if (ringClaims !== nClaims) {
    setRingClaims(nClaims)
    setRingTileIds([])
  }
  const ringTiles = ringTileIds.flatMap((id) => gd.board.tilesById[id] ?? [])

  async function spend() {
    const next = nextHint(gd.board.tiles, ringTiles)
    if (next === null) return
    const nextIds = next.map((t) => t.id)
    setRingTileIds(nextIds)
    setPicks(nextIds)
    // Recorded BEFORE the claim, not alongside it. Firing both at once put two
    // transactions on the same two rows in opposite orders and Postgres broke
    // the tie with a deadlock — reliably, on the third hint, since that is the
    // press that also claims. Awaiting is the causal order anyway: you asked,
    // and then it was claimed.
    const res = await runRpc<HintAnswer>(db.rpc('record_hint', {
      p_game_id: gd.id,
      p_tiles: nextIds.map(Number),
    }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data.result === 'recorded') {
      // The claim lives IN this branch, because a recorded hint is the only
      // answer it may follow. Only the third rung gets here with three tiles,
      // and three picked tiles claim, the same path a third click takes.
      if (next.length === CLAIM_SIZE) {
        setPicks([])
        await submitClaim(next)
      }
    } else {
      reportUnhandled('record_hint', res)
    }
  }

  return { ringTiles, spend }
}
