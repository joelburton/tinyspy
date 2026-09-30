// cs-unmet

/**
 * How a game ended, and how each player's part in it ended — the ending
 * columns of `common.games` and `common.game_players` as the front end reads
 * them. The terms are docs/win-lose.md's; the columns and who writes them are
 * docs/common-schema.md → Ending a game.
 *
 * Types only, like `members/member.ts`, so the many files that import them
 * erase at compile time and never join an import cycle.
 */

import type { Outcome } from '../outcomes/outcomes'

/** Why a game ended: the category of the act that ended it
 *  (`common.games.game_ended_reason`). The game's own word for the act is the
 *  reason detail beside it. */
export type GameEndedReason =
  | 'reached_goal'
  | 'resource_exhausted'
  | 'all_passed'
  | 'fatal_move'
  | 'conceded'
  | 'timeout'
  | 'stopped'

/** Why one player's play ended while the game went on
 *  (`common.game_players.player_ended_reason`). */
export type PlayerEndedReason =
  | 'reached_goal'
  | 'resource_exhausted'
  | 'fatal_move'
  | 'conceded'
  | 'timeout'

/**
 * How a game, or one player, came out (`common.games.game_ended_outcome`,
 * `common.game_players.outcome`), and how everything that shows an ending
 * reads: the pill, the info column's line, the board's frame.
 *
 * `near` is a ranking below first. Cut from the outcome vocabulary rather than
 * spelled out, so renaming a member of that list breaks here. It is narrower
 * because the rest judge something an ending is not: `warning` and `noted` a
 * move, `error` a fault.
 */
export type EndOutcome = Extract<Outcome, 'won' | 'lost' | 'near' | 'neutral'>

/**
 * A game's ending, read off its `common.games` row: null while the game is
 * played, so "has it ended?" is `ending !== null`.
 */
export type GameEnding = {
  reason: GameEndedReason
  // The game's own word for the act: 'solved', 'assassin', 'stopped'.
  reasonDetail: string
  outcome: EndOutcome
  // The player whose act ended it; null for a timeout nobody's turn covers.
  endedByUserId: string | null
}
