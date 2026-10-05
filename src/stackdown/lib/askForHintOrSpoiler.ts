// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from './answer'
import type { GGameData } from '../types'

/** What the two rungs put in `data`. Each has exactly one `ok` answer today,
 *  and `result` names it anyway: a call site may not take an `ok` branch by
 *  merely matching `ok` (docs/envelopes.md → Choosing which `ok` branch), or a
 *  second answer added to either RPC would be drawn as this one, silently. */
type SpoilerAnswer = { result: 'spoiler'; word: string }
type HintAnswer = { result: 'hint'; clue: string }

/**
 * The hint ladder's two rungs, asked of the server for the next word I still
 * have to clear: a `hint` is its clue (`common.words.hint`, which hides the
 * word), a `spoiler` the word itself — the way out for a stuck player. Every
 * word a stackdown board can hold carries a clue, so the server treats a
 * missing one as a fault.
 *
 * The answer goes in MY slot as a `hint`, which leaves only by its × — it
 * lingers while I hunt for the tiles. The row the server wrote arrives in the
 * event log with the next blob.
 */
export async function askForHintOrSpoiler(
  gd: GGameData,
  localFeedbackSlot: FeedbackSlot,
  kind: 'hint' | 'spoiler',
): Promise<void> {
  if (kind === 'hint') {
    const res = await runRpc<HintAnswer>(db.rpc('reveal_next_hint', { p_game_id: gd.id }))
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'hint') {
      const { outcome, text } = answerMessage({ answerType: 'hint', clue: res.data.clue })
      localFeedbackSlot.show(FeedbackMessage.hint(outcome, text))
      return
    } else {
      reportUnhandled('reveal_next_hint', res)
      return
    }
  }

  const res = await runRpc<SpoilerAnswer>(db.rpc('reveal_next_word', { p_game_id: gd.id }))
  if (res.type === 'not-ok') {
    localFeedbackSlot.show(FeedbackMessage.notOk(res))
    return
  } else if (res.type === 'ok' && res.data.result === 'spoiler') {
    const { outcome, text } = answerMessage({ answerType: 'spoiler', word: res.data.word })
    localFeedbackSlot.show(FeedbackMessage.hint(outcome, text))
    return
  } else {
    reportUnhandled('reveal_next_word', res)
    return
  }
}
