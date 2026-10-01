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
import type { BoardRow } from '../lib/board'
import { WORD_LENGTH } from '../lib/setup'

/**
 * What `wordle.submit_guess` puts in `data` — the fact, and nothing about how
 * it reads: the words and the color are `lib/answer.ts`'s, keyed on `result`.
 *
 * A UNION, because the two halves are not the same answer wearing one shape. A
 * soft reject burns no guess and carries no colors — there is no row to color —
 * while an accepted guess always has them.
 */
type GuessAnswer =
  // Soft rejects: the rules were applied, nothing was burned, the typed row
  // stays.
  | {
      result: 'duplicate' | 'notAWord'
      guesses_used: number
      solved: false
      game_ended: false
    }
  // Accepted: the guess is recorded. `colors` and the ending reach this surface
  // by realtime like everyone else's, so neither is read here.
  | {
      result: 'correct' | 'incorrect'
      colors: string
      guesses_used: number
      solved: boolean
      game_ended: boolean
    }

/**
 * Sending a guess, and the word still out with the server.
 *
 * `submitGuess(word)` resolves to whether the guess was accepted, so the entry
 * knows to clear what was typed. A short word is refused here, without a
 * call. A soft reject (`duplicate`, `notAWord`) and a not-ok both leave the
 * typed row where it is, shake it in the answer's own outcome
 * (`refusedGuessMark`, which `<Board>` reads), and say why in the local slot;
 * the words come from `lib/answer.ts` or the envelope, so the ring and the pill
 * cannot name two different things. An accepted guess shows nothing extra: its
 * colored row, and a win with it, arrive over realtime the way they reach
 * everyone else.
 *
 * `inFlightWord` is the accepted-but-not-yet-drawn guess: kept on the board,
 * uncolored, from the moment it is sent until its colored row is among
 * `liveRows`, so the letters don't blink out during the round trip; the row
 * then flips in place. Derived from the rows rather than cleared when they
 * arrive, so no branch can leave a word stuck. A Restart needs no gate: the
 * page unmounts the surface when the run changes (common/game-page/doc.md).
 *
 * One guess is out at a time: Enter's run waits for `submitGuess`, and a bound
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
  liveRows: readonly BoardRow[]
  localFeedbackSlot: FeedbackSlot
}): {
  submitGuess: (word: string) => Promise<boolean>
  inFlightWord: string | null
  refusedGuessMark: Mark<Outcome> | null
} {
  // The word I last sent, or null. Cleared by a refusal; it outlives an
  // accepted guess, so what is still out is derived below.
  const [submittedWord, setSubmittedWord] = useState<string | null>(null)
  // `liveRows` only grows within a run, so once the row has landed it stays.
  const hasSubmittedWordLanded =
    submittedWord !== null && liveRows.some((row) => row.guess === submittedWord)
  const inFlightWord = hasSubmittedWordLanded ? null : submittedWord

  // `WORD_ANSWER_MS` is the beat for a word wearing its answer, and the row
  // keys on the mark's nonce, so refusing the same word twice shakes twice.
  const [refusedGuessMark, showRefusedGuessMark] = useMark<Outcome>(WORD_ANSWER_MS)

  /** Both soft rejects: nothing was burned, so the typed row stays and
   *  shakes. */
  function refuseSoftly(answerType: 'duplicate' | 'not_a_word') {
    const { outcome, text } = answerMessage({ answerType })
    setSubmittedWord(null)
    showRefusedGuessMark(outcome)
    localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
  }

  async function submitGuess(word: string): Promise<boolean> {
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
      refuseSoftly('duplicate')
      return false
    } else if (res.type === 'ok' && res.data.result === 'notAWord') {
      refuseSoftly('not_a_word')
      return false
    } else if (res.type === 'ok' && res.data.result === 'correct') {
      return true
    } else if (res.type === 'ok' && res.data.result === 'incorrect') {
      // The same as `correct`, and still its own branch: one branch per answer
      // (docs/envelopes.md → The shape of a call site).
      return true
    } else {
      // The word is on the board waiting for a row that may never arrive, so
      // take it back before reporting.
      setSubmittedWord(null)
      reportUnhandled('submit_guess', res)
      return false
    }
  }

  return { submitGuess, inFlightWord, refusedGuessMark }
}
