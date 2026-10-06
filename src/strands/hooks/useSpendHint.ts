// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { hintShortfallText } from '../lib/hintCopy'
import type { GGameData } from '../types'

/** What `spend_hint` answers: one `ok`, and the ring lands with the blobs. */
type HintAnswer = { result: 'hinted' }

/**
 * Cash a hint: `spendHint()` sends `spend_hint`, or — on a bar not yet full —
 * says in the local slot how many hint words are still to find. The button
 * stays clickable before the bar fills because an early click is a fair
 * question, and a dead button can't answer it.
 */
export function useSpendHint({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  // Where the shortfall, or a refusal, says so.
  localFeedbackSlot: FeedbackSlot
}): () => Promise<void> {
  return async function spendHint() {
    const short = gd.setup.hint_cost - gd.me.hintPoints
    if (short > 0) {
      localFeedbackSlot.show(FeedbackMessage.result('warning', hintShortfallText(short)))
      return
    }
    const res = await runRpc<HintAnswer>(db.rpc('spend_hint', { p_game_id: gd.id }))
    // Its refusals are the SHARED POOL moving between the check above and this
    // call — a teammate filled the bar, spent it, or ringed a word.
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'hinted') {
      // Nothing to say: the ring lands on the board with the blob.
      return
    } else {
      reportUnhandled('spend_hint', res)
      return
    }
  }
}
