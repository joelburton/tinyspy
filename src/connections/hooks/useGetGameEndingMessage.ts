// cs-unmet

import { useMemo } from 'react'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildGameEndingMessage } from '../lib/gameEndingMessage'
import type { GGameData } from '../types'

/**
 * The ending's message — the below-board pill and the info column's line —
 * or null while the game is played. Mode-aware, so compete tells "you won the
 * race" from "beaten to the punch" and "out of mistakes", while coop stays the
 * team verdict.
 *
 * WHY it ended is the server's word (`gd.ending.reason`), never the
 * browser's: the RPC that ended the game wrote the reason, and the club-list
 * label reads the same column.
 *
 * The message keeps its identity for as long as the ending does, which is what
 * lets the effect that shows it show it once rather than on every reload of
 * the blob. The blob rebuilds its `ending` object on every reload, so the memo
 * keys on the ending's strings and flags, not on that object.
 */
export function useGetGameEndingMessage(gd: GGameData): TerminalMessage | null {
  const outcome = gd.outcome
  const reason = gd.ending?.reason ?? null
  const playerOutcome = gd.me.outcome
  const iWasEliminated = gd.me.ending?.reason === 'resource_exhausted'

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
            iWasEliminated,
          }),
    [outcome, reason, gd.mode, playerOutcome, iWasEliminated],
  )
}
