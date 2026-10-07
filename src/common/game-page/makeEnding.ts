// cs-unmet

import type { GameEnding, GameEndingRaw } from './gameData.ts'

/**
 * A game's ending with its links turned into the game's players, or null while
 * the game is played. `players` is the game's, in seat order; `winners` is
 * every one ranked first, read off each player's `finalRanking`, which is the
 * server's ranking and the only place a winner is written.
 */
export function makeEnding<P extends { id: string; finalRanking: number | null }>(
  raw: GameEndingRaw | null,
  players: readonly P[],
): GameEnding<P> | null {
  if (raw === null) return null
  return {
    reason: raw.reason,
    detail: raw.detail,
    by: raw.by === null ? null : players.find((p) => p.id === raw.by)!,
    winners: players.filter((p) => p.finalRanking === 1),
  }
}
