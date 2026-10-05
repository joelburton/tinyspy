// cs-unmet

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useMark } from '@/common/board-marks/useMark'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import type { Outcome } from '@/common/outcomes/outcomes'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import type { FoundWordsWord } from '@/shared/found-words/foundWords'
import { useFoundWordSubmit } from '@/shared/found-words/useFoundWordSubmit'
import { db } from '../db'
import { answerMessage, answerOf } from '../lib/answer'
import type { GAnswerMark, GGameData } from '../types'

/**
 * What `wordiply.submit_guess` puts in `data`.
 *
 * The two results reach DIFFERENT call sites, which is what `p_fe_legal` says:
 * `send` claims the word is legal and can only be told `accepted`, while
 * `recordReject` reports a rejection the page already made and asks which rule
 * applied. A duplicate is neither — nothing is recorded, so it refuses.
 */
type GuessResult =
  | { result: 'accepted' }
  | { result: 'rejected'; reason: 'too_short' | 'missing_base' | 'not_a_word' }

/**
 * The move: the typed word, its trip to the server, and its answer on the
 * board's line.
 *
 * The legal list ships with the puzzle, so a word is judged here against a
 * Set: the shared `useFoundWordSubmit` owns the typed word, the optimistic
 * submit and the dedup, and this hook supplies the lookup (points = the
 * word's length), the `submit_guess` call, and what each answer shows. A
 * rejected word is a move too, recorded through `recordReject`, since in
 * wordiply it can cost the go.
 *
 * **The answer stays on the line the word was typed into.** The engine clears
 * the entry on submit — it has to, or a double-tap double-fires — so without
 * the held word it would vanish for a round trip. An accepted word stays held
 * until the server's row lands behind it; a refused one is shown for the beat
 * and then goes, which is also how long its color is up.
 */
export function useSubmitGuess({
  gd,
  localFeedbackSlot,
}: {
  gd: GGameData
  // Where a refusal and the server's not-ok are shown.
  localFeedbackSlot: FeedbackSlot
}): {
  // The word being typed, which `useTypedGuess` types into.
  word: string
  setWord: Dispatch<SetStateAction<string>>
  // The last submitted word, which ArrowUp recalls.
  lastWord: string
  submit: () => void
  answerMark: GAnswerMark
} {
  const base = gd.puzzle.base
  const legalWords = useMemo(() =>
    new Set(gd.puzzle.legalWords), [gd.puzzle.legalWords])

  // My word, held in the next line until the server's row lands behind it
  // (`GAnswerMark`).
  const [held, setHeld] = useState<GAnswerMark['held']>(null)
  // Always timed, for everyone: a mark that waits for your next move is a mark
  // still claiming something about a board you have moved on from.
  const [flash, showFlash] = useMark<{ word: string; outcome: Outcome }>(
    WORD_ANSWER_MS)

  const showAnswer = useCallback(
    (word: string, outcome: Outcome, isForeign = false) => {
      // A teammate's word is already a row of its own, so it is announced
      // with the attention flash; mine is held in the next line — accepted,
      // until its row lands; refused, until its mark goes.
      if (!isForeign) setHeld({ word, awaitingRow: outcome === 'won' })
      showFlash(
        { word, outcome },
        {
          attention: isForeign,
          onEnd: outcome === 'won' ? undefined : () => setHeld(null),
        },
      )
    },
    [showFlash],
  )

  // A held word waiting for its row goes the moment that row lands.
  const isHeldRowLanded =
    held !== null && held.awaitingRow && gd.me.board.words.includes(held.word)
  if (isHeldRowLanded) setHeld(null)

  const { word, setWord, lastWord, submit } = useFoundWordSubmit({
    isMyTurn: gd.me.onTurn,
    // Must be LONGER than the base.
    minWordLength: base.length + 1,
    localFeedbackSlot,
    // Every row I can see, rejects included: the server dedups on rejects
    // too, so a retry reads as "already found" here rather than round-tripping.
    foundWords: gd.events,
    lookup: (w): FoundWordsWord | null =>
      legalWords.has(w) ? {
        word: w,
        points: w.length,
        bonus: false,
        pangram: false,
      } : null,
    // One `ok` reaches this path. `rejected` is the other answer the RPC can
    // give, but only to `recordReject`: the page checks every rule before
    // sending, so a rules break claimed legal comes back as PN367, a fault.
    send: async (e) => {
      const res = await runRpc<GuessResult>(
        db.rpc('submit_guess', { p_game_id: gd.id, p_word: e.word }),
      )
      if (res.type === 'not-ok') {
        return res
      } else if (res.type === 'ok' && res.data.result === 'accepted') {
        return null
      } else {
        reportUnhandled('submit_guess', res)
        return null
      }
    },
    // Every answer, on the line and in the pill, from one `lib/answer.ts`
    // call so the two cannot disagree. An accepted word has no words: its line
    // IS the answer.
    onAnswer: (report) => {
      const { outcome, text } = answerMessage(answerOf(report, base))
      showAnswer(report.word, outcome)
      if (text !== '') localFeedbackSlot.show(FeedbackMessage.result(outcome,
        text))
    },
    // Record the rejection: `p_fe_legal: false` reports a rejection the page
    // made, and the server says which rule applied. Fire-and-forget: the pill
    // has already said the same thing, so a failed write must not change what
    // the player sees.
    recordReject: (w) => {
      void runRpc<GuessResult>(
        db.rpc('submit_guess',
          { p_game_id: gd.id, p_word: w, p_fe_legal: false }),
      ).then((res) => {
        if (res.type === 'ok' && res.data.result === 'rejected') {
          // Expected: the row is logged. Nothing to show.
        } else if (res.type === 'not-ok') {
          // Logged, not shown: the pill has already told the player, and
          // `runRpc` has raised the modal for the faults among these.
          console.error('recording a rejected guess failed', res.message)
        } else {
          reportUnhandled('submit_guess', res)
        }
      })
    },
  })

  return {
    word,
    setWord,
    lastWord,
    submit,
    answerMark: { held, flash, show: showAnswer },
  }
}
