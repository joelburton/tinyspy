// cs-unmet

import type { EndOutcome, GameEndedReason, PlayerEndedReason } from '../terminal/gameEnding'
import type { Member } from '../members/member'

/**
 * The common part of every game's playarea blob, as `common._make_json_playarea`
 * writes it (supabase/sql/common.sql → The page blobs' common parts): the game
 * facts every game shares, and each player with where they stand. A game's own
 * playarea type extends it with the game's fields and its own player; a game's
 * builder writes the two together, so a game reads one blob.
 *
 * Links are ids here (`turns.holder`, `ending.by`, `ending.winner`); a game's
 * `useGame` turns them into its players.
 */
export type CommonPlayarea = {
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
  title: string
  // The setup form's record, frozen at create. A game reads it as its own type.
  setup: Record<string, unknown>
  // Null: no turn order. `holder` null: nobody's turn right now.
  turns: { holder: string | null } | null
  // Null while the game is played. `by` is the player whose act ended it, null
  // for a timeout nobody's turn covers; `winner` the player ranked first, null
  // when nobody was.
  ending: {
    reason: GameEndedReason
    // The game's own word for the act: 'solved', 'exhausted', 'stopped'.
    detail: string
    by: string | null
    winner: string | null
  } | null
  // The game has ended.
  ended: boolean
  // Null until the game ends.
  outcome: EndOutcome | null
  // Everyone in the game, in seat order.
  players: CommonPlayareaPlayer[]
}

/**
 * A player as every playarea shows them: who they are, their seat, how and
 * whether they ended, and where they stand (docs/win-lose.md → Where a player
 * stands). Inside a group a predicate about its subject is bare: `conceded`,
 * `solved`, `onTurn`.
 */
export type CommonPlayareaPlayer = Member & {
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
