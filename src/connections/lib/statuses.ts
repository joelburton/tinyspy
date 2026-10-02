// cs-unmet

import type { SummaryData } from '@/common/manifest/summaryData'
import type { PlayerEndedReason } from '@/common/terminal/gameEnding'

/**
 * connections' copies on `common.games`, as `connections._write_statuses`
 * writes the first two (supabase/sql/connections.sql). Every key is always
 * present, null when it has no value, so no key here is optional. `useGame`
 * copies the first two into `gd`; the summary reads the third.
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
 * `common.games.summary_data`: the common part, and connections' keys beside
 * it. connections' builder writes it once connections is on the page blobs
 * (plans/seat-view.md → The page is written, not assembled); until then the
 * club page lists no connections game, and this is the shape its summary is
 * written against. The two counts are coop's team numbers and null in compete,
 * whose summary shows no progress; the race's winner is the common
 * `ending.winner`.
 */
export type ConnectionsSummaryData = SummaryData & {
  foundCategoriesCount: number | null
  mistakeCount: number | null
}
