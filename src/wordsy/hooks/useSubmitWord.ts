// cs-unmet

import { useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import type { GAnswer, GGameData } from '../types'

/** What `wordsy.submit_word` puts in `data`. A refusal only the server can
 *  judge — not in the dictionary, or a root an earlier round scored — comes
 *  back `ok`, recording nothing; `earlier` names the scored word. What the
 *  submit did to the round, the page reads from the next blob. */
type SubmitAnswer = {
  result: 'submitted' | 'notAWord' | 'alreadyPlayed'
  earlier: string | null
  timer_started: boolean
  round_ended: boolean
  game_ended: boolean
}

/**
 * A word's trip to `submit_word`, and what its answer says in the pill:
 * "Your word is in", "Not a word at this dictionary", "Already played: FISH".
 * A race — my word frozen, No Flip, the game over — is a not-ok the page's
 * gates should have kept from being sent, and shows as itself.
 *
 *   send      submit this word; resolves to whether it now stands
 *   inFlight  a submit is on its way: the entry is busy
 */
export function useSubmitWord({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  localFeedbackSlot: FeedbackSlot
}): {
  send: (word: string) => Promise<boolean>
  inFlight: boolean
} {
  const [inFlight, setInFlight] = useState(false)

  function showAnswer(answer: GAnswer) {
    const { outcome, text } = answerMessage(answer)
    localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
  }

  async function send(word: string): Promise<boolean> {
    setInFlight(true)
    const res = await runRpc<SubmitAnswer>(db.rpc('submit_word', {
      p_game_id: gd.id,
      p_word: word,
    }))
    setInFlight(false)
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return false
    } else if (res.type === 'ok' && res.data.result === 'submitted') {
      showAnswer({ answerType: 'submitted' })
      return true
    } else if (res.type === 'ok' && res.data.result === 'notAWord') {
      showAnswer({ answerType: 'not_a_word' })
      return false
    } else if (res.type === 'ok' && res.data.result === 'alreadyPlayed') {
      showAnswer({ answerType: 'already_played', earlier: res.data.earlier! })
      return false
    } else {
      reportUnhandled('submit_word', res)
      return false
    }
  }

  return { send, inFlight }
}
