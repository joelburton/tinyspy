// cs-unmet

import { useMemo } from 'react'
import type { EndingMessage } from '@/common/ending/endingMessage'
import { buildBeePlayerEndingMessage } from '@/shared/bee-games/endingMessage'
import type { GGameData } from '../types'

/**
 * My ending's message — the below-board pill and the info column's line —
 * while I have ended and the others race on. Null while I can still play,
 * and null once the game has ended, when the game's ending message replaces it.
 *
 * Only compete reaches it, and only by conceding: reaching the target ends the
 * game for everyone.
 *
 * The message keeps its identity for as long as my ending does, which is what
 * lets the effect that shows it show it once. The memo keys on the reason and
 * outcome strings, not on `gd.me`, which is rebuilt on every reload.
 */
export function useGetPlayerEndingMessage(gd: GGameData): EndingMessage | null {
  const reason = gd.ended ? null : (gd.me.ending?.reason ?? null)
  // Written in the same update as the reason (`common._concede`).
  const outcome = gd.me.outcome
  return useMemo(
    () => (reason === null || outcome === null ? null : buildBeePlayerEndingMessage({ reason, outcome })),
    [reason, outcome],
  )
}
