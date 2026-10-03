// cs-unmet

import { useState } from 'react'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import type { GAnswer, GTile } from '../types'

/** What `psychicnum.submit_guess` puts in `data` — the caller's own result,
 *  plus whether that guess completed the set. Every `ok` this RPC answers
 *  carries one; its refusals are all `not-ok`. */
type GuessAnswer = { result: 'hit' | 'miss'; found_all: boolean }

/**
 * Sending a guess, and the tile still out with the server.
 *
 * `send(tile)` shows its answer in the local slot — Correct, Wrong, or
 * a refusal — in the slot's already-claimed space, never a new line that would
 * reflow the board.
 *
 * - **A refusal the board can make itself.** It is face-up and the tile is
 *   the live one, so a word a teammate has guessed since I picked it never
 *   reaches the server. The server keeps the check, and its answer is then a
 *   race rather than a verdict (docs/envelopes.md → "was anything local
 *   consulted first?"). The live board is scoped exactly as the server's
 *   check is — everyone's guesses in coop, mine in compete.
 * - **The result is mine and nothing else.** Whether the guess ended the game
 *   rides beside it in `found_all`, which this ignores: every ending reaches
 *   the page by realtime, and a hit that empties the budget is still a hit to
 *   the person who made it. So two branches cover three server returns (the
 *   win, the guess that spends the last of the budget, the ordinary one).
 *
 * `inFlightTile` is the tile with the server, which takes the in-flight dim;
 * null when nothing is out, and null while a past turn is open (that is not
 * the board the guess is on). The hook holds the sent tile's ID and reads the
 * live tile back from `tilesById`, so the dim holds until the RESULT lands on
 * the board rather than until the RPC resolves: the reply and the colored tile
 * are two events, and un-dimming at the first would flash an undecided tile
 * back to normal. Deriving it from the live tile, rather than clearing state
 * when the result arrives, means no branch can leave a dim stuck on a tile. A
 * restart needs no gate: the page unmounts the surface when the run changes
 * (common/game-page/doc.md).
 */
export function useSubmitGuess({
  gameId,
  tilesById,
  localFeedbackSlot,
  isViewingHistory,
}: {
  gameId: string
  // The live board's tiles, by id (`gd.me.board.tilesById`).
  tilesById: ReadonlyMap<string, GTile>
  localFeedbackSlot: FeedbackSlot
  isViewingHistory: boolean
}): {
  send: (tile: GTile) => Promise<void>
  inFlightTile: GTile | null
} {
  // The id of the tile I last sent, or null. Nothing clears it when the
  // result lands; what is still in flight is derived below.
  const [inFlightTileId, setInFlightTileId] = useState<string | null>(null)
  // A sent tile names a tile on the live board, so the lookup cannot miss.
  const sentTile = inFlightTileId === null ? null : tilesById.get(inFlightTileId)!

  // Every answer reaches the player the same way: one `GAnswer` in, its words
  // and its color out of `lib/answer.ts`.
  function showAnswer(answer: GAnswer) {
    const { outcome, text } = answerMessage(answer)
    localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
  }

  async function send(tile: GTile) {
    if (tile.correct !== null) {
      showAnswer({ answerType: 'already_guessed' })
      return
    }
    setInFlightTileId(tile.id)
    const guessResult = await runRpc<GuessAnswer>(
      db.rpc('submit_guess', { p_game_id: gameId, p_guess: tile.word }),
    )
    if (guessResult.type === 'not-ok') {
      setInFlightTileId(null)
      localFeedbackSlot.show(FeedbackMessage.notOk(guessResult))
    } else if (guessResult.type === 'ok' && guessResult.data.result === 'hit') {
      showAnswer({ answerType: 'hit', word: tile.word })
    } else if (guessResult.type === 'ok' && guessResult.data.result === 'miss') {
      showAnswer({ answerType: 'miss', word: tile.word })
    } else {
      // Nothing named this answer, so the tile must not keep claiming to be in
      // flight — no result is coming that would release it.
      setInFlightTileId(null)
      reportUnhandled('submit_guess', guessResult)
    }
  }

  const isInFlightShown = sentTile !== null && sentTile.correct === null && !isViewingHistory
  return {
    send,
    inFlightTile: isInFlightShown ? sentTile : null,
  }
}
