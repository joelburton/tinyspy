// cs-unmet

import { useMemo } from 'react'
import type { EndingMessage } from '@/common/ending/endingMessage'
import { buildPlayerEndingMessage } from '../lib/playerEndingMessage'
import type { GGameData } from '../types'

/**
 * My ending's message — the verdict in the active-clue bar and the strip's
 * line — while I have conceded and the others race on. Null while I can still
 * play, and null once the game has ended, when the game's ending message
 * replaces it.
 *
 * The memo keys on the reason and outcome strings, not on `gd.me`, which is
 * rebuilt on every reload, so the effect that shows the message shows it once.
 */
export function useGetPlayerEndingMessage(gd: GGameData): EndingMessage | null {
  const reason = gd.ended ? null : (gd.me.ending?.reason ?? null)
  // Written in the same update as the reason.
  const outcome = gd.me.outcome
  return useMemo(
    () =>
      reason === null || outcome === null
        ? null
        : buildPlayerEndingMessage({ reason, outcome }),
    [reason, outcome],
  )
}
