// cs-unmet

import { useEffect, useRef, useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import type { GAnswer, GGameData, GSentWord } from '../types'

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
 * Every one of them is about the round it was sent in, so the round's end, a
 * new table or a Restart takes them all down.
 *
 *   send      submit this word; resolves to what became of it
 *   inFlight  a submit is on its way: the entry is busy
 */
export function useSubmitWord({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  localFeedbackSlot: FeedbackSlot
}): {
  send: (word: string) => Promise<GSentWord>
  inFlight: boolean
} {
  const [inFlight, setInFlight] = useState(false)

  // The ids of the messages this round's submits put up, for the retract.
  const shownIds = useRef<string[]>([])

  // The board changed: the round ended, its scoresheet in the board's place,
  // or a new round was dealt. Take this round's answers down; the slot's other
  // messages — the ending among them — are not this hook's.
  useEffect(function retractAnswersOnNewBoard() {
    for (const id of shownIds.current) localFeedbackSlot.retract(id)
    shownIds.current = []
  }, [gd.round.num, gd.round.ended, localFeedbackSlot])

  function show(message: FeedbackMessage) {
    shownIds.current.push(localFeedbackSlot.show(message))
  }

  function showAnswer(answer: GAnswer) {
    const { outcome, text } = answerMessage(answer)
    show(FeedbackMessage.result(outcome, text))
  }

  async function send(word: string): Promise<GSentWord> {
    setInFlight(true)
    const res = await runRpc<SubmitAnswer>(db.rpc('submit_word', {
      p_game_id: gd.id,
      p_word: word,
    }))
    setInFlight(false)
    if (res.type === 'not-ok') {
      show(FeedbackMessage.notOk(res))
      return 'kept'
    } else if (res.type === 'ok' && res.data.result === 'submitted') {
      showAnswer({ answerType: 'submitted' })
      return 'stands'
    } else if (res.type === 'ok' && res.data.result === 'notAWord') {
      showAnswer({ answerType: 'not_a_word' })
      return 'refused'
    } else if (res.type === 'ok' && res.data.result === 'alreadyPlayed') {
      showAnswer({ answerType: 'already_played', earlier: res.data.earlier! })
      return 'kept'
    } else {
      reportUnhandled('submit_word', res)
      return 'kept'
    }
  }

  return { send, inFlight }
}
