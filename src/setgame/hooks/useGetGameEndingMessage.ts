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
 * clock's, and who won is the server's: every player it ranked first, which a
 * tie makes several.
 *
 * The message keeps its identity for as long as the ending does, which is what
 * lets the effect that shows it show it once rather than on every reload of
 * the blob. The blob rebuilds its objects on every reload, so the memo keys on
 * strings and numbers, not on them.
 */
export function useGetGameEndingMessage(gd: GGameData): TerminalMessage | null {
  const gameOutcome = gd.outcome
  const reason = gd.ending?.reason ?? null
  const playerOutcome = gd.me.outcome
  const nSetsFound = gd.players.reduce((n, p) => n + p.nSetsFound, 0)
  const nTilesLeft = gd.board.tiles.length
  const winners = gd.players.filter((p) => p.finalRanking === 1)
  // Joined for the memo; split again for the builder.
  const winnerNamesKey = winners.map((p) => p.username).join('\n')
  const nWinnerSets = winners[0]?.nSetsFound ?? null

  return useMemo(
    () =>
      gameOutcome === null || reason === null
        ? null
        : buildGameEndingMessage({
          mode: gd.mode,
          gameOutcome,
          reason,
          // Written with the game's ending (`common._end_game` ranks every
          // player), so it is set whenever the game's outcome is.
          playerOutcome: playerOutcome!,
          nSetsFound,
          nTilesLeft,
          winnerNames: winnerNamesKey === '' ? [] : winnerNamesKey.split('\n'),
          nWinnerSets,
        }),
    [gameOutcome, reason, gd.mode, playerOutcome, nSetsFound, nTilesLeft, winnerNamesKey, nWinnerSets],
  )
}
