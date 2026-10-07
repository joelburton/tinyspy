// cs-unmet

import { useMemo } from 'react'
import type { EndingMessage } from '@/common/ending/endingMessage'
import { buildGameEndingMessage } from '../lib/gameEndingMessage'
import type { GGameData } from '../types'

/**
 * The ending's message — the below-board pill and the info column's line —
 * or null while the game is played.
 *
 * WHY it ended is the server's word (`gd.ending.reason`), never the browser
 * clock's, and who won is the server's (`gd.ending.winners`, each player's
 * `outcome`).
 *
 * The message keeps its identity for as long as the ending does, which is what
 * lets the effect that shows it show it once rather than on every reload of
 * the blob. The blob rebuilds its objects on every reload, so the memo keys on
 * strings, not on them.
 */
export function useGetGameEndingMessage(gd: GGameData): EndingMessage | null {
  const outcome = gd.outcome
  const reason = gd.ending?.reason ?? null
  const playerOutcome = gd.me.outcome
  // The winner by name and color, so the memo keys on strings.
  const winnerName = gd.ending?.winners[0]?.username ?? null
  const winnerColor = gd.ending?.winners[0]?.color ?? null

  return useMemo(
    () =>
      outcome === null || reason === null
        ? null
        : buildGameEndingMessage({
          mode: gd.mode,
          gameEnding: { outcome, reason },
          // Written with the game's ending (`common._end_game` ranks every
          // player), so it is set whenever the game's outcome is.
          playerOutcome: playerOutcome!,
          winner: winnerName === null ? null : { username: winnerName, color: winnerColor! },
        }),
    [outcome, reason, gd.mode, playerOutcome, winnerName, winnerColor],
  )
}
