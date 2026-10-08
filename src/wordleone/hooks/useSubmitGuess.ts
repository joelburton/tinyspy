// cs-unmet

import { useState } from 'react'
import type { Outcome } from '@/common/outcomes/outcomes'
import { useMark, type Mark } from '@/common/board-marks/useMark'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { notOkOutcome, runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import { WORD_LENGTH } from '../lib/setup'
import type { GBoardRow } from '../types'

/**
 * What `wordleone.submit_guess` puts in `data` — the fact, and nothing about
 * how it reads: the words and the color are `lib/answer.ts`'s, keyed on
 * `result`.
 *
 * A UNION, because the two halves are not the same answer wearing one shape: a
 * soft reject counts nothing, a miss and the solve are recorded.
 */
type GuessAnswer =
  // Soft rejects: the rules were applied, nothing was counted.
  | {
      result: 'duplicate' | 'notAWord'
      n_misses: number
      solved: false
      game_ended: false
    }
  // Recorded. The green row, the count and the ending reach this surface by
  // realtime like everyone else's, so none is read here.
  | {
      result: 'correct' | 'miss'
      n_misses: number
      solved: boolean
      game_ended: boolean
    }

/**
 * Sending a guess, and the word still out with the server.
 *
 * `send(word, clearTypedWord)` resolves to whether the entry should clear what
 * was typed now. A short word is refused here, without a call, and stays to
 * be finished. A word the server judged and did not take — a miss, a
 * `duplicate`, a `notAWord` — shakes the typed row in the answer's own outcome
 * (`refusedMark`, which `<Board>` reads), says why in the local slot, and
 * clears once its shake is over (`clearTypedWord`): nothing of it stays on the
 * board. A not-ok shakes and says so the same way and leaves the word, since
 * the word was never judged. The words come from `lib/answer.ts` or the
 * envelope, so the ring and the pill cannot name two different things. The
 * solve shows nothing extra: its green row, and the win with it, arrive over
 * realtime the way they reach everyone else.
 *
 * `inFlight` is the guess out with the server: kept on the board, uncolored,
 * from the moment it is sent until the solve's row is among `liveRows`, so the
 * letters don't blink out during the round trip; the row then flips in place.
 * Derived from the rows rather than cleared when they arrive, so no branch can
 * leave a word stuck. A Restart needs no gate: the page unmounts the surface
 * when the run changes (common/game-page/doc.md).
 *
 * One guess is out at a time: Enter's run waits for `send`, and an
 * action neither runs nor draws live while its run is out (`useBindAction`'s
 * `pending`).
 */
export function useSubmitGuess({
  gameId,
  liveRows,
  localFeedbackSlot,
}: {
  gameId: string
  // The board's rows as the server last drew them.
  liveRows: readonly GBoardRow[]
  localFeedbackSlot: FeedbackSlot
}): {
  send: (word: string, clearTypedWord: () => void) => Promise<boolean>
  inFlight: string | null
  refusedMark: Mark<Outcome> | null
} {
  // The word I last sent, or null. Cleared by a refusal; it outlives an
  // accepted guess, so what is still out is derived below.
  const [submittedWord, setSubmittedWord] = useState<string | null>(null)
  // `liveRows` only grows within a run, so once the row has landed it stays.
  const hasSubmittedWordLanded =
    submittedWord !== null && liveRows.some((row) => row.word === submittedWord)
  const inFlight = hasSubmittedWordLanded ? null : submittedWord

  // `WORD_ANSWER_MS` is the beat for a word wearing its answer, and the row
  // keys on the mark's nonce, so refusing the same word twice shakes twice.
  const [refusedMark, showRefusedGuessMark] = useMark<Outcome>(WORD_ANSWER_MS)

  /** A judged word that lands no row: take it back, shake the typed row in the
   *  answer's outcome, say why, and clear the row when the shake ends. */
  function shakeThenClear(answerType: 'duplicate' | 'not_a_word' | 'miss',
    clearTypedWord: () => void,
  ) {
    const { outcome, text } = answerMessage({ answerType })
    setSubmittedWord(null)
    showRefusedGuessMark(outcome, { onEnd: clearTypedWord })
    localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
  }

  async function send(word: string, clearTypedWord: () => void): Promise<boolean> {
    if (word.length !== WORD_LENGTH) {
      const { outcome, text } = answerMessage({ answerType: 'too_short' })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return false
    }
    setSubmittedWord(word)
    const res = await runRpc<GuessAnswer>(
      db.rpc('submit_guess', { p_game_id: gameId, p_guess: word }),
    )
    if (res.type === 'not-ok') {
      setSubmittedWord(null)
      showRefusedGuessMark(notOkOutcome(res))
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return false
    } else if (res.type === 'ok' && res.data.result === 'duplicate') {
      shakeThenClear('duplicate', clearTypedWord)
      return false
    } else if (res.type === 'ok' && res.data.result === 'notAWord') {
      shakeThenClear('not_a_word', clearTypedWord)
      return false
    } else if (res.type === 'ok' && res.data.result === 'correct') {
      return true
    } else if (res.type === 'ok' && res.data.result === 'miss') {
      shakeThenClear('miss', clearTypedWord)
      return false
    } else {
      // The word is on the board waiting for a row that may never arrive, so
      // take it back before reporting.
      setSubmittedWord(null)
      reportUnhandled('submit_guess', res)
      return false
    }
  }

  return { send, inFlight, refusedMark }
}
