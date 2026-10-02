// cs-unmet

import { useState } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { db } from '../db'
import { answerMessage, type Answer } from '../lib/answer'
import type { TileResults, TileWord } from '../lib/tileResults'

/** What `psychicnum.submit_guess` puts in `data` — the caller's own result,
 *  plus whether that guess completed the set. Every `ok` this RPC answers
 *  carries one; its refusals are all `not-ok`. */
type GuessAnswer = { result: 'hit' | 'miss'; found_all: boolean }

/**
 * Sending a guess, and the word still out with the server.
 *
 * `send(word)` shows its answer in the local slot — Correct, Wrong, or
 * a refusal — in the slot's already-claimed space, never a new line that would
 * reflow the board.
 *
 * - **A refusal the board can make itself.** It is face-up and its results are
 *   already here, so a word a teammate has guessed since I picked it never
 *   reaches the server. The server keeps the check, and its answer is then a
 *   race rather than a verdict (docs/envelopes.md → "was anything local
 *   consulted first?"). `tileResults` is scoped exactly as the server's check
 *   is — everyone's guesses in coop, mine in compete, since RLS never shows
 *   more.
 * - **The result is mine and nothing else.** Whether the guess ended the game
 *   rides beside it in `found_all`, which this ignores: every ending reaches
 *   the page by realtime, and a hit that empties the budget is still a hit to
 *   the person who made it. So two branches cover three server returns (the
 *   win, the guess that spends the last of the budget, the ordinary one).
 *
 * `inFlight` is the word with the server, whose tile takes the in-flight
 * dim; null when nothing is out, and null while a past turn is open (that is
 * not the board the guess is on). It holds until the RESULT lands in
 * `tileResults` rather than until the RPC resolves: the reply and the colored
 * tile are two events, and un-dimming at the first would flash an undecided
 * tile back to normal. Deriving it from the results, rather than clearing
 * state when they arrive, means no branch can leave a dim stuck on a tile. A
 * restart needs no gate: the page unmounts the surface when the run changes
 * (common/game-page/doc.md).
 */
export function useSubmitGuess({
  gameId,
  tileResults,
  localFeedbackSlot,
  isViewingHistory,
}: {
  gameId: string
  tileResults: TileResults
  localFeedbackSlot: FeedbackSlot
  isViewingHistory: boolean
}): {
  send: (word: TileWord) => Promise<void>
  inFlight: TileWord | null
} {
  // The word I last sent, or null. Nothing clears it when the result lands;
  // what is still in flight is derived below.
  const [submittedWord, setSubmittedWord] = useState<TileWord | null>(null)
  const isSubmittedWordDecided = submittedWord !== null && tileResults.has(submittedWord)

  // Every answer reaches the player the same way: one `Answer` in, its words
  // and its color out of `lib/answer.ts`.
  function showAnswer(answer: Answer) {
    const { outcome, text } = answerMessage(answer)
    localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
  }

  async function send(word: TileWord) {
    if (tileResults.has(word)) {
      showAnswer({ answerType: 'already_guessed' })
      return
    }
    setSubmittedWord(word)
    const guessResult = await runRpc<GuessAnswer>(
      db.rpc('submit_guess', { p_game_id: gameId, p_guess: word }),
    )
    if (guessResult.type === 'not-ok') {
      setSubmittedWord(null)
      localFeedbackSlot.show(FeedbackMessage.notOk(guessResult))
    } else if (guessResult.type === 'ok' && guessResult.data.result === 'hit') {
      showAnswer({ answerType: 'hit', word })
    } else if (guessResult.type === 'ok' && guessResult.data.result === 'miss') {
      showAnswer({ answerType: 'miss', word })
    } else {
      // Nothing named this answer, so the tile must not keep claiming to be in
      // flight — no result is coming that would release it.
      setSubmittedWord(null)
      reportUnhandled('submit_guess', guessResult)
    }
  }

  const isInFlightShown = !isSubmittedWordDecided && !isViewingHistory
  return {
    send,
    inFlight: isInFlightShown ? submittedWord : null,
  }
}
