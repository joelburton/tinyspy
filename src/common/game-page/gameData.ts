// cs-unmet

import type { EndOutcome, GameEndedReason, PlayerEndedReason } from '../terminal/gameEnding.ts'
import type { TimerMode } from '../manifest/types.ts'
import type { Player } from '../members/member.ts'

/**
 * The common part of every game's `static_game_data`, as
 * `common._make_json_static_game_data` writes it (supabase/sql/common.sql →
 * The page blobs' common parts): what nothing after create changes. The page
 * reads it once and takes the timer from `setup`; the game's `useGame` merges
 * the whole blob into `game_data`.
 */
export type StaticGameDataRaw = {
  id: string
  gametype: string
  // The gametype's user-facing name.
  brand: string
  club: { handle: string }
  mode: 'coop' | 'compete'
  coop: boolean
  compete: boolean
  // The game has one board that every player's moves land on; false, each
  // player plays their own copy.
  oneBoard: boolean
  // The setup form's record, frozen at create. A game reads it as its own type;
  // every game's carries the timer.
  setup: Record<string, unknown> & { timer: TimerMode }
}

/**
 * The common part of what a game reads: its `game_data`, as
 * `common._make_json_game_data` writes it (supabase/sql/common.sql → The page
 * blobs' common parts), with its `static_game_data` merged in by its `useGame`
 * — the game facts every game shares, and each player with where they stand. A
 * game's own `GGameDataRaw` extends it with the game's fields and its own
 * player. Bare names, since these are common's; a game's wear the `G`
 * (docs/code-conventions.md → A game's types).
 *
 * Links are ids here (`turns.holder`, `ending.by`, `ending.winner`); a game's
 * `useGame` turns them into its players.
 */
export type GameDataRaw = StaticGameDataRaw & {
  title: string
  // Null: no turn order. In a turn game the pointer is set at create and only
  // ever advanced or rewound, so it always names a player.
  turns: { holder: string } | null
  // Null while the game is played.
  ending: GameEndingRaw | null
  // The game has ended.
  ended: boolean
  // Null until the game ends.
  outcome: EndOutcome | null
  // Everyone in the game, in seat order.
  players: PlayerRaw[]
}

/**
 * How a game ended, as `common._make_json_ending` writes it into game_data and
 * summary_data. `by` is the player whose act ended it, null for a timeout
 * nobody's turn covers; `winner` the player ranked first, null when nobody was.
 */
export type GameEndingRaw = {
  reason: GameEndedReason
  // The game's own word for the act: 'solved', 'exhausted', 'stopped'.
  detail: string
  by: string | null
  winner: string | null
}

/**
 * A player as every game_data shows them: who they are, their seat, how and
 * whether they ended, and where they stand (docs/win-lose.md → Where a player
 * stands). Inside a group a predicate about its subject is bare: `conceded`,
 * `solved`, `onTurn`.
 */
export type PlayerRaw = Player & {
  // This seat is an AI opponent.
  ai: boolean
  // Null in a free-for-all game.
  seat: number | null
  // Null unless they ended before the game did.
  ending: {
    at: string
    reason: PlayerEndedReason
    // The game's own word for the act: 'conceded', 'exhausted', 'solved'.
    detail: string
  } | null
  // Null until written: at their own ending, and again at the game's end.
  outcome: EndOutcome | null
  // Null until the game ends.
  finalRanking: number | null
  solvedAt: string | null
  // Walked away from a compete game; never true in coop.
  conceded: boolean
  // `solvedAt` is set. A coop solve stamps every teammate.
  solved: boolean
  // The game still wants moves from this player.
  stillPlaying: boolean
  // Still playing, and the move is theirs: they hold the turn, or the game has
  // no turn order.
  onTurn: boolean
  // Still playing, and the move is someone else's.
  waitingForTurn: boolean
}
