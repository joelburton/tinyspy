// cs-unmet

import { useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'

/** What `waffle.submit_swap` puts in `data` for a swap it took. Only `result` is
 *  read — the rest is deliberately ignored, because the new colors must reach
 *  every player together in the next blob rather than reaching the swapper a
 *  round trip early. It is typed anyway: the fields exist on the wire, and a
 *  reader deserves to see what was declined rather than what was missing. */
type SwapAnswer = {
  result: 'swapped'
  colors: string
  swaps_used: number
  solved: boolean
  terminal: boolean
}

/**
 * Send a swap, and hold it on the board while it is out.
 *
 * **The move is shown at once; its verdict is not** (plans/tile-feedback.md →
 * "What the dim does NOT excuse"). The moment you drop a tile, the two letters
 * trade places and the two cells go unjudged — their old color was invalidated
 * by the move and the new one is the server's to give. A board that didn't move
 * would read as a swap that didn't happen. The colors then arrive for everyone
 * together, in the next blob; the swapper is not shown them a round trip early,
 * because in coop they would be acting on a board their teammates can't see
 * yet. Which is why `submit_swap`'s reply — it returns the new colors — is
 * ignored here. Don't wire it up.
 *
 * **The swap in flight lasts until the newest row of the log changes**
 * (`newestEventId`): my swap landing adds my row, a teammate's adds theirs, and
 * either way the board on show is the server's again. It needs no timer and
 * cannot outlive its answer. The RPC resolving is NOT the end of it: the reply
 * beats the blob, and dropping it there would leave two colorless tiles sitting
 * undimmed until the board caught up.
 *
 * **The swap still out is the one in-flight guard.** A tap and a drag swap
 * with no action behind them, so an action's `pending` cannot cover them;
 * `<Board>` takes no swap of any kind while `pendingSwap` is set, and it is set
 * from the moment of sending until the swap's row lands.
 */
export function useSubmitSwap({
  gameId,
  newestEventId,
  localFeedbackSlot,
}: {
  gameId: string
  // The newest row of `gd.events`, or null when it is empty.
  newestEventId: number | null
  // Where a refused swap says why.
  localFeedbackSlot: FeedbackSlot
}): {
  // The two cells of the swap still out, or null.
  pendingSwap: readonly [number, number] | null
  // Swap the letters of two filled cells.
  send: (a: number, b: number) => void
} {
  const [inFlight, setInFlight] = useState<{
    cells: readonly [number, number]
    atEventId: number | null
  } | null>(null)

  async function send(a: number, b: number) {
    setInFlight({ cells: [a, b], atEventId: newestEventId })
    const res = await runRpc<SwapAnswer>(
      db.rpc('submit_swap', { p_game_id: gameId, p_pos_a: a, p_pos_b: b }),
    )
    if (res.type === 'not-ok') {
      // Refused (the turn moved, the game ended, you conceded). Optimism is
      // about ACCEPTANCE, so this is the price: take the letters back, then
      // say why in the words the server sent.
      setInFlight(null)
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'swapped') {
      // Accepted: the swap stays on the board until the blob carries its row.
      // `result` is read BECAUSE the rest is ignored: an answer nobody inspects
      // can change into something else without anyone noticing.
      return
    } else {
      // The swap is waiting for a row that may never come, so drop it —
      // otherwise two letters sit swapped and colorless until a reload.
      setInFlight(null)
      reportUnhandled('submit_swap', res)
      return
    }
  }

  const pendingSwap =
    inFlight !== null && inFlight.atEventId === newestEventId ? inFlight.cells : null
  return { pendingSwap, send }
}
