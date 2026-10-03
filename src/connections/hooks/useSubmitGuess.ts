// cs-unmet

import { useState } from 'react'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import { TILES_PER_CATEGORY } from '../lib/board'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import type { GGameData, GPicks, GGuessResult } from '../types'
import type { GVerdictMark } from '../types'

/** Empty tile set — the resting value of the in-flight mark. */
const NO_TILES: ReadonlySet<string> = new Set()

/**
 * What `connections.submit_guess` puts in `data`: the verdict it RECORDED.
 *
 * The frontend adjudicates the guess itself (`evaluateGuess`, the FE-knows
 * model) and sends its answer up, so this tells it nothing new — but a call
 * site may not pick an `ok` branch by reading its own local value back
 * (docs/envelopes.md → Choosing which `ok` branch), so each recorded verdict is
 * its own answer. A guess that wrote NOTHING is not here at all: it comes back
 * as PN300 or PN301, both races.
 */
type GuessAnswer = { result: GGuessResult }

/**
 * Sending the picked four, and the tiles still out with the server.
 *
 * `send()` shows its answer in the local slot and on the four tiles it
 * is about (`markTiles`), then clears the picks, so every verdict leaves the
 * board in the same state.
 *
 * - **A refusal the board can make itself.** A set already tried never reaches
 *   the server: the log is face-up, so the check is local. The server keeps
 *   the same check, and its answer is then a race rather than a verdict
 *   (docs/envelopes.md → "was anything local consulted first?").
 * - **The verdict is worked out here and sent up**, in the word the column
 *   stores (`evaluateGuess`); a correct guess names its category's rank.
 * - **A not-ok leaves the picks in place, and marks nothing.** The move
 *   wasn't taken, so the four tiles are still sitting there un-played; the
 *   server's sentence shows in the local slot, and a fault's modal has
 *   already fired (`runRpc`).
 *
 * `inFlight` is the four tiles out with the server, wearing the in-flight dim
 * until the answer lands, rather than a verdict guessed locally. They are a
 * copy taken at SEND: the picks are cleared on the way out, and a teammate can
 * move them in coop.
 *
 * One guess is out at a time: Submit's run waits for `send`, and an
 * action neither runs nor draws live while its run is out (`useBindAction`'s
 * `pending`).
 */
export function useSubmitGuess({
  gd,
  picks,
  localFeedbackSlot,
  markTiles,
}: {
  gd: GGameData
  picks: GPicks
  localFeedbackSlot: FeedbackSlot
  // Color the four tiles an answer is about and show the answer beside them
  // (`useVerdictMark`).
  markTiles: GVerdictMark['markTiles']
}): {
  send: () => Promise<void>
  inFlight: ReadonlySet<string>
} {
  const [inFlight, setInFlightGuess] = useState<ReadonlySet<string>>(NO_TILES)

  async function send() {
    const sent = [...picks.union]
    if (sent.length !== TILES_PER_CATEGORY) return

    // The log I can see is the board I play: coop's whole shared log, or my
    // own rows in a race still running.
    if (gd.events.some((e) => sameTileSet(e.tiles, sent))) {
      const { outcome, text } = answerMessage({ answerType: 'already_tried' })
      markTiles({ tiles: sent, outcome, message: FeedbackMessage.result(outcome, text) })
      picks.sendClear()
      return
    }

    const evaluation = evaluateGuess(sent, gd.puzzle.cats)
    setInFlightGuess(new Set(sent))
    // Only a match names a category. The argument is OPTIONAL rather than
    // nullable, so the other two verdicts leave it out rather than send null.
    const matchedCategory =
      evaluation.result === 'correct' ? { p_matched_cat_rank: evaluation.rank } : {}
    const res = await runRpc<GuessAnswer>(db.rpc('submit_guess', {
      p_game_id: gd.id,
      p_tiles: sent,
      p_result: evaluation.result,
      ...matchedCategory,
    }))
    setInFlightGuess(NO_TILES)

    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    // One branch per recorded verdict, each asserting `data` and nothing else
    // (docs/envelopes.md → The shape of a call site) — never the value this
    // client sent up.
    } else if (res.type === 'ok' && res.data.result === 'correct') {
      // No mark: these four collapse into a band on this very render.
      const { outcome, text } = answerMessage({ answerType: 'correct' })
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      picks.sendClear()
      return
    } else if (res.type === 'ok' && res.data.result === 'oneAway') {
      const { outcome, text } = answerMessage({ answerType: 'one_away' })
      markTiles({ tiles: sent, outcome, message: FeedbackMessage.result(outcome, text) })
      picks.sendClear()
      return
    } else if (res.type === 'ok' && res.data.result === 'wrong') {
      const { outcome, text } = answerMessage({ answerType: 'wrong' })
      markTiles({ tiles: sent, outcome, message: FeedbackMessage.result(outcome, text) })
      picks.sendClear()
      return
    } else {
      reportUnhandled('submit_guess', res)
      picks.sendClear()
      return
    }
  }

  return { send, inFlight }
}
