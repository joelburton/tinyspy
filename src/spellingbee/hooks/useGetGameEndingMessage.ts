// cs-unmet

import { useMemo } from 'react'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildBeeGameEndingMessage } from '@/shared/bee-games/endingMessage'
import type { GGameData } from '../types'

/**
 * The ending's message — the below-board pill and the info column's line —
 * or null while the game is played. The words are the bee games' shared ones
 * (`buildBeeGameEndingMessage`), fed from `gd`: how the game ended, how I came
 * out, who won, and the state line's data the score is read against.
 *
 * The message keeps its identity for as long as the ending does, which is what
 * lets the effect that shows it show it once rather than on every reload of
 * the blob. The blob rebuilds its objects on every reload, so the memo keys on
 * the strings and numbers, not on them.
 */
export function useGetGameEndingMessage(gd: GGameData): TerminalMessage | null {
  const outcome = gd.outcome
  const reason = gd.ending?.reason ?? null
  const playerOutcome = gd.me.outcome
  const winner = gd.ending?.winner ?? null
  const { foundWordsScore, rankIdx, targetRankIdx } = gd.me
  const reqdWordsScore = gd.puzzle.reqdWordsScore
  return useMemo(
    () =>
      outcome === null || reason === null
        ? null
        : buildBeeGameEndingMessage({
            mode: gd.mode,
            gameEnding: { outcome, reason },
            playerOutcome,
            winner,
            facts: gd.me,
            puzzle: gd.puzzle,
          }),
    // `winner` is a player object the blob rebuilds; its id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcome, reason, gd.mode, playerOutcome, winner?.id, foundWordsScore, rankIdx, targetRankIdx, reqdWordsScore],
  )
}
