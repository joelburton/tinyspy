// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import { coordOf } from '../lib/board'
import type { GAnswer, GGameData, GResult, GTile, GTrace } from '../types'

/** What `submit_path` answers: the verdict, and my hint bar after the move. */
type SubmitAnswer = { result: GResult; hint_points: number }

/**
 * The trace's trip to the server: `submitTrace(tiles)` sends it to
 * `submit_path`, shows the answer in the local slot, and empties the trace
 * unless it found a puzzle word.
 *
 * A found word keeps its tiles: they stay lit as the trace until the blob lands
 * and `useTrace`'s derived clear hands them over to their found colors — no
 * blank flash in between. It runs as the Submit action's `run`, so the action's
 * own `pending` is the one in-flight guard.
 */
export function useSubmitTrace({
  gd,
  localFeedbackSlot,
  trace,
}: {
  gd: GGameData
  // Where the answer, or a refusal, says so.
  localFeedbackSlot: FeedbackSlot
  trace: GTrace
}): (tiles: readonly GTile[]) => Promise<void> {
  return async function submitTrace(tiles) {
    const res = await runRpc<SubmitAnswer>(db.rpc('submit_path', {
      p_game_id: gd.id,
      p_path: tiles.map(coordOf),
    }))
    // A refusal here is NOT a verdict on the word — the six verdicts are all
    // `ok`. It is a trace this board could not have produced (a fault), or a
    // move somebody else overtook: `Crosses a found word` when a teammate's
    // find lands on tiles you were drawing through, `Game over`, `Not your
    // turn`. Either way the trace goes, because it no longer describes anything
    // on the board.
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      trace.clear()
      return
    } else if (res.type === 'ok') {
      // ONE branch over the six: `answerMessage` says each one's words and
      // outcome.
      const word = tiles.map((t) => t.letter).join('')
      const { result } = res.data
      const answer: GAnswer = result === 'hint_word'
        ? { answerType: result, word, filledBar: res.data.hint_points >= gd.setup.hint_cost }
        : { answerType: result, word }
      const message = answerMessage(answer)
      localFeedbackSlot.show(FeedbackMessage.result(message.outcome, message.text))
      if (result !== 'theme' && result !== 'spangram') trace.clear()
      return
    } else {
      reportUnhandled('submit_path', res)
      trace.clear()
      return
    }
  }
}
