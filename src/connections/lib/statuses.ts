// cs-unmet

import type { PlayerEndedReason } from '@/common/terminal/gameEnding'

/**
 * connections' three copies, as `connections._write_statuses` writes them
 * (supabase/sql/connections.sql). Every key is always present, null when it
 * has no value, so no key here is optional. `useGame` copies the first two
 * into `gd`; the club line reads the third.
 */

/** `common.games.game_status`: the table-facts, fixed at create. */
export type ConnectionsGameStatus = {
  required_categories_count: number
  max_mistakes: number
}

/**
 * One player's `common.game_players.player_status`. `found_categories_count`
 * is the player's own matches in both modes; `mistake_count` is the team's in
 * coop, the same on every row, and the player's own in compete.
 */
export type ConnectionsPlayerStatus = {
  found_categories_count: number
  mistake_count: number
  player_ended_reason: PlayerEndedReason | null
}

/**
 * `common.games.clubpage_info`. The two counts are coop's team numbers and
 * null in compete, whose club line shows no progress; the winner is compete's,
 * null until the end and always null in coop.
 */
export type ConnectionsClubpageInfo = {
  found_categories_count: number | null
  mistake_count: number | null
  winner_user_id: string | null
}
