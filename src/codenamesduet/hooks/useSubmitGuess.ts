// cs-unmet

import { useState } from 'react'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useSingleFlight } from '@/common/single-flight/useSingleFlight'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import type { GPlayer, GTile } from '../types'

/**
 * What `submit_guess` answers. Four `ok`s: the two that end the game are
 * named for its outcome and carry its detail, and the two that leave it
 * running are named for what was turned over. `revealed` is the key the guess
 * hit ('G' | 'N' | 'A').
 */
type GuessAnswer =
  | {
  result: 'agent' | 'bystander'
  revealed: 'G' | 'N'
  found_agents_count: number
  turn_number: number
  turns_remaining: number
  // Null once a bystander drops the game into sudden death, and for every
  // agent turned over there: nobody clues in sudden death.
  clue_giver: 'A' | 'B' | null
  play_state: 'playing' | 'sudden_death'
}
  | {
  result: 'won' | 'lost'
  reason: 'solved' | 'assassin' | 'turns'
  revealed: 'G' | 'N' | 'A'
  found_agents_count: number
  turns_used: number
}

/**
 * Sending a guess, and the tile still out with the server.
 *
 * `send(tile)` guesses it. The reveal arrives in the next blob, so there is no
 * optimistic state and an accepted guess says nothing here: the tile turning
 * over is the answer, and a pill would only repeat the board. A refusal is the
 * opposite — nothing on the board changes — so it is said in the local slot,
 * and no reveal is coming to release the tile.
 *
 * `inFlightTile` is the tile with the server, which takes the in-flight dim;
 * null when nothing is out, and null while a past turn is open (that is not
 * the board the guess is on). The hook holds the sent tile's ID and reads the
 * live tile back from `tilesById`, so the dim holds until the REVEAL lands —
 * the tile stops being guessable for me — rather than until the RPC resolves:
 * the reply and the reveal are two events, and releasing at the first would
 * flash an undecided tile back to normal. A restart needs no gate: the page
 * unmounts the surface when the run changes (common/game-page/doc.md).
 *
 * One guess at a time: `send` is single-flight (`useSingleFlight`), so a
 * same-tick double tap, or a click on a DIFFERENT tile while the first guess
 * commits, sends nothing more; from the reply until the reveal lands,
 * `inFlightTile` holds the next guess back.
 */
export function useSubmitGuess({
  gameId,
  tilesById,
  me,
  localFeedbackSlot,
  isViewingHistory,
}: {
  gameId: string
  // The live table's tiles, by id (`gd.me.board.tilesById`).
  tilesById: ReadonlyMap<string, GTile>
  // Whose guess: it is out until the tile is no longer mine to guess.
  me: GPlayer
  localFeedbackSlot: FeedbackSlot
  isViewingHistory: boolean
}): {
  send: (tile: GTile) => void
  inFlightTile: GTile | null
} {
  // The id of the tile I last sent, or null. Nothing clears it when the
  // reveal lands; what is still in flight is derived below.
  const [sentTileId, setSentTileId] = useState<string | null>(null)
  // A sent tile names a tile on the live table, so the lookup cannot miss.
  const sentTile = sentTileId === null ? null : tilesById.get(sentTileId)!
  // Still out until its reveal makes it no longer mine to guess.
  const inFlightTile = sentTile !== null && sentTile.guessableBy.has(me) &&
  !isViewingHistory ? sentTile : null

  async function submitGuess(tile: GTile) {
    localFeedbackSlot.dismiss() // a guess is the next move
    setSentTileId(tile.id)
    const res = await runRpc<GuessAnswer>(db.rpc('submit_guess', {
      p_game_id: gameId,
      p_guess_position: Number(tile.id),
    }))
    // The refusals are mostly races (orange): the board and the turn arrive
    // in the next blob, and in sudden death my partner guesses at the same
    // time as me.
    if (res.type === 'not-ok') {
      setSentTileId(null)
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
    } else if (res.type === 'ok' && res.data.result === 'agent') {
      return
    } else if (res.type === 'ok' && res.data.result === 'bystander') {
      return
    } else if (res.type === 'ok' && res.data.result === 'won') {
      // The ending's verdict is PlayArea's: it reads the ending off `gd`, shows
      // it into the slot and pops the celebration. Saying it here as well would
      // say it twice.
      return
    } else if (res.type === 'ok' && res.data.result === 'lost') {
      return
    } else {
      // Nothing named this answer, so the tile must not keep claiming to be
      // in flight — there is no reveal coming that would release it.
      setSentTileId(null)
      reportUnhandled('submit_guess', res)
    }
  }

  // Guards a non-idempotent request from firing twice; see `useSingleFlight`.
  const [send] = useSingleFlight(submitGuess)
  return { send, inFlightTile }
}
