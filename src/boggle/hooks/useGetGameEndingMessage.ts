// cs-unmet

import { useMemo } from 'react'
import type { EndingMessage } from '@/common/ending/endingMessage'
import { buildGameEndingMessage } from '../lib/endingMessage'
import type { GGameData } from '../types'

/**
 * The ending's message — the below-board pill and the info column's line —
 * or null while the game is played (`buildGameEndingMessage`, fed from `gd`).
 *
 * The message keeps its identity for as long as the ending does, which is what
 * lets the effect that shows it show it once rather than on every reload of
 * the blob. The blob rebuilds its objects on every reload, so the memo keys on
 * the strings and numbers, not on them.
 */
export function useGetGameEndingMessage(gd: GGameData): EndingMessage | null {
  const outcome = gd.outcome
  const reason = gd.ending?.reason ?? null
  const playerOutcome = gd.me.outcome
  const conceded = gd.me.conceded
  const winner = gd.ending?.winners[0] ?? null
  const hasTarget = gd.setup.win_percent !== null
  const tally = `${gd.me.nFoundWords} words, ${gd.me.foundWordsScore} points`
  return useMemo(
    () =>
      outcome === null || reason === null
        ? null
        : buildGameEndingMessage({
            mode: gd.mode,
            gameEnding: { outcome, reason },
            playerOutcome,
            conceded,
            winner,
            hasTarget,
            tally,
          }),
    // `winner` is a player object the blob rebuilds; its id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcome, reason, gd.mode, playerOutcome, conceded, winner?.id, hasTarget, tally],
  )
}
