// cs-unmet

import { useMemo } from 'react'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildGameEndingMessage } from '../lib/gameEndingMessage'
import type { GGameData } from '../types'

/**
 * The ending's message — the below-board pill and the info column's line —
 * or null while the game is played.
 *
 * WHY it ended is the server's word (`gd.ending.reason`), never the browser
 * clock's, and who went out is the server's `ending.winner`.
 *
 * The message keeps its identity for as long as the ending does, which is what
 * lets the effect that shows it show it once rather than on every reload of
 * the blob. The blob rebuilds its objects on every reload, so the memo keys on
 * strings, not on them.
 */
export function useGetGameEndingMessage(gd: GGameData): TerminalMessage | null {
  const gameOutcome = gd.outcome
  const reason = gd.ending?.reason ?? null
  const playerOutcome = gd.me.outcome
  const winnerName = gd.ending?.winner?.username ?? null
  const winnerColor = gd.ending?.winner?.color ?? null

  return useMemo(
    () =>
      gameOutcome === null || reason === null
        ? null
        : buildGameEndingMessage({
          gameOutcome,
          reason,
          // Written with the game's ending (`common._end_game` sets every
          // player's), so it is set whenever the game's outcome is.
          playerOutcome: playerOutcome!,
          winner: winnerName === null ? null : { username: winnerName, color: winnerColor! },
        }),
    [gameOutcome, reason, playerOutcome, winnerName, winnerColor],
  )
}
