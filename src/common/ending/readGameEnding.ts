// cs-unmet

import type { EndOutcome, GameEndedReason, GameEnding } from './gameEnding'

/**
 * The ending columns of a `common.games` row, as selected by name. The game
 * page and the club list both read the row, and both pass it here.
 */
export type GameEndingColumns = {
  ended_at: string | null
  game_ended_reason: string | null
  game_ended_reason_detail: string | null
  game_ended_outcome: string | null
  game_ended_by_user_id: string | null
}

/**
 * A game's ending off its row: null while `ended_at` is. The database sets the
 * reason pair and the outcome together with `ended_at` (a check constraint), so
 * an ended row always has them.
 */
export function readGameEnding(row: GameEndingColumns): GameEnding | null {
  if (row.ended_at === null) return null
  return {
    reason: row.game_ended_reason as GameEndedReason,
    reasonDetail: row.game_ended_reason_detail ?? '',
    outcome: row.game_ended_outcome as EndOutcome,
    endedByUserId: row.game_ended_by_user_id,
  }
}
