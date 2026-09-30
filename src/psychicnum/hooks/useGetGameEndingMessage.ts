// cs-unmet

import { useMemo } from 'react'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildGameEndingMessage } from '../lib/gameEndingMessage'
import type { GameData } from './useGame'

/**
 * The ending's message — the below-board pill and the info column's line —
 * or null while the game is played. Mode-aware, so compete tells "you won the
 * race" from "Bea won the race", while coop stays the simple team verdict.
 *
 * WHY it ended is the server's word (`gd.gameEnding.reason`), never the
 * browser clock's: the RPC that ended the game wrote the reason, and the
 * club-list label reads the same column.
 *
 * The message keeps its identity for as long as the ending does, which is what
 * lets the effect that shows it show it once rather than on every reload of
 * the page's row. The page rebuilds its `gameEnding` object on every reload,
 * so the memo keys on the ending's two strings, not on that object.
 */
export function useGetGameEndingMessage(gd: GameData): TerminalMessage | null {
  const outcome = gd.gameEnding?.outcome ?? null
  const reason = gd.gameEnding?.reason ?? null
  const myOutcome = gd.me?.outcome ?? null
  const winnerName = gd.winner?.username ?? 'Someone'
  return useMemo(
    () =>
      outcome === null || reason === null
        ? null
        : buildGameEndingMessage({
            mode: gd.mode,
            gameEnding: { outcome, reason },
            myOutcome,
            winnerName,
          }),
    [outcome, reason, gd.mode, myOutcome, winnerName],
  )
}
