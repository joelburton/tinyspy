// cs-unmet

import { useMemo } from 'react'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildGameEndingMessage } from '../lib/endingMessage'
import type { GGameData } from '../types'

/**
 * The ending's message — the below-board pill and the info column's line —
 * or null while the game is played (`buildGameEndingMessage`, fed from `gd`).
 *
 * The message keeps its identity for as long as the ending does, which is what
 * lets the effect that shows it show it once rather than on every reload of
 * the blob, so the memo keys on the strings, not on the objects.
 */
export function useGetGameEndingMessage(gd: GGameData): TerminalMessage | null {
  const outcome = gd.outcome
  const detail = gd.ending?.detail ?? null
  return useMemo(
    () => (outcome === null || detail === null ? null : buildGameEndingMessage({ outcome, detail })),
    [outcome, detail],
  )
}
