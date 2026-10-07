// cs-unmet

import type { GameEndingRaw } from '../game-page/gameData.ts'
import type { EndOutcome } from '../ending/gameEnding.ts'

/**
 * The common part of every game's `summary_data`, as
 * `common._make_json_summary_data` writes it (supabase/sql/common.sql → The page
 * blobs' common parts): the game named and dated, and how it ended. A game's
 * own `GSummaryData` extends it with the numbers its summary shows; the game's
 * builder writes the two together, so a list of games reads this blob and
 * nothing else of the row. Bare names, since these are common's; a game's wear
 * the `G` (docs/code-conventions.md → A game's types).
 *
 * `ending.by` and `ending.winner` are ids; a `summaryFor` names them from the
 * club's members.
 */
export type SummaryData = {
  id: string
  gametype: string
  title: string
  // When the game's status last changed: a create, a Restart, a move or the
  // end. A list dates and orders games by it.
  statusChangedAt: string
  // The game has ended.
  ended: boolean
  // Null until the game ends.
  outcome: EndOutcome | null
  // Null while the game is played.
  ending: GameEndingRaw | null
}
