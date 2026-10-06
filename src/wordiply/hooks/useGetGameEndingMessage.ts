// cs-unmet

import { useMemo } from 'react'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildGameEndingMessage } from '../lib/gameEndingMessage'
import type { GGameData } from '../types'

/**
 * The ending's message — the below-board pill and the info column's line —
 * or null while the game is played. The scores in it are the builder's,
 * written once the game has ended.
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
  // A coop player's side is the team.
  const teamLengthScore = gd.coop ? gd.me.lengthScore : null
  const teamNLetters = gd.coop ? gd.me.nLetters : null
  const winner = gd.ending?.winner ?? null
  const winnerId = winner?.id ?? null
  const winnerName = winner?.username ?? null
  const winnerColor = winner?.color ?? null
  const winnerLengthScore = winner?.lengthScore ?? null

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
            // A coop team's scores are written at every ending.
            teamScores: gd.coop ? { lengthScore: teamLengthScore!, nLetters: teamNLetters! } : null,
            // A winner's scores are written with the ending that ranked them.
            winner: winnerId === null
              ? null
              : { username: winnerName!, color: winnerColor!, lengthScore: winnerLengthScore! },
          }),
    [outcome, reason, gd.mode, gd.coop, playerOutcome, teamLengthScore, teamNLetters,
      winnerId, winnerName, winnerColor, winnerLengthScore],
  )
}
