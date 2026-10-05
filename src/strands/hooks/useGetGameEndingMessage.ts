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
 * clock's, and who won is the server's (each player's `outcome`).
 *
 * The message keeps its identity for as long as the ending does, which is what
 * lets the effect that shows it show it once rather than on every reload of
 * the blob. The blob rebuilds its objects on every reload, so the memo keys on
 * strings and numbers, not on them.
 */
export function useGetGameEndingMessage(gd: GGameData): TerminalMessage | null {
  const outcome = gd.outcome
  const reason = gd.ending?.reason ?? null
  const playerOutcome = gd.me.outcome
  const nFoundPuzzleWords = gd.stateLineData.nFoundPuzzleWords
  // Every winner: the race's ranking lets a tie share the win.
  const winners = gd.players.filter((p) => p.outcome === 'won')
  const winnerNames = winners.map((p) => p.username).join(' + ')
  const iSolved = gd.me.solved
  const nMyHints = gd.me.nHintsUsed
  const nWinnerHints = winners[0]?.nHintsUsed ?? null

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
          nFoundPuzzleWords,
          winnerNames,
          iSolved,
          nMyHints,
          nWinnerHints,
        }),
    [outcome, reason, gd.mode, playerOutcome, nFoundPuzzleWords, winnerNames, iSolved, nMyHints, nWinnerHints],
  )
}
