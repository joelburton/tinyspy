// cs-unmet

import { useMemo } from 'react'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildPlayerEndingMessage } from '../lib/playerEndingMessage'
import type { GameData } from './useGame'

/**
 * My ending's message — the below-board pill and the info column's line —
 * while I have ended and the others play on. Null while I can still play,
 * and null once the game has ended, when the game's ending message replaces it.
 *
 * Only compete reaches it: a coop player does not end on their own.
 *
 * The message keeps its identity for as long as my ending does, which is what
 * lets the effect that shows it show it once. The memo keys on the reason and
 * outcome strings, not on `gd.me`, which is rebuilt on every reload.
 */
export function useGetPlayerEndingMessage(gd: GameData): TerminalMessage | null {
  const reason = gd.isGameEnded ? null : (gd.me?.playerEnding?.reason ?? null)
  // Written in the same update as the reason (`common._set_player_ended`,
  // `common._concede`).
  const outcome = gd.me?.outcome ?? null
  return useMemo(
    () =>
      reason === null || outcome === null
        ? null
        : buildPlayerEndingMessage({ reason, outcome }),
    [reason, outcome],
  )
}
