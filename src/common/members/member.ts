// cs-blessed-members

import type { EndOutcome, PlayerEndedReason } from '../terminal/gameEnding.ts'

/**
 * Who someone IS — the identity shape every render site in the app shares, and
 * the game-context superset that adds how their game ended.
 *
 * Reach for this whenever you render a person: a chat sender, a club roster
 * row, a player in an OpponentStrip, a name in an event log. `Member` is the
 * three fields you always need; `Player` is the same three, named for a seat;
 * `GamePlayerLegacy` adds the ones that only exist once someone is seated in a
 * game, for the games not yet on `game_data`.
 *
 * **Types only, and that is load-bearing.** `Member` is imported by more of the
 * app than any other name here, so a module with no runtime half means all of
 * those imports erase at compile time and cannot participate in an import
 * cycle, whatever else moves later. The one VALUE that reads these types was
 * put in `common/terminal/terminalOutcomeVerb.ts` precisely so it stays out of
 * this file. Keep it that way: no functions, no constants.
 */

/**
 * One person's identity, with the three fields every render
 * site needs: id, username, color.
 *
 * Same shape covers chat-message sender (club context) and
 * game player (game context). The naming distinction is at the
 * **variable** level — `members: Member[]` in club code,
 * `players: Player[]` in game code, where each game declares
 * its own `Player` alias on top of `Member`. See
 * docs/naming.md → "member" and "player" for the full
 * rationale.
 */
export type Member = {
  // The account's id: `common.profiles.user_id`. Named `id` here because a
  // player is a player, not a "user" — `gd.me.id`, `playersById[p.id]`.
  id: string
  username: string
  // A palette NAME from `common.profiles.color` — 'red' … 'pink', never a
  // hex. `colorVarFor` resolves it to the fill variable, `borderVarFor` to
  // the paired edge.
  color: string
}

/**
 * A seated player: the same three fields as a `Member`, under the name that
 * says what they are here. A sentence that waits for a player, a column that
 * ranks players, is about seats, not club membership, and the type says so
 * even though the data is the same. Every game's `GPlayer` extends it, through
 * the blob's `PlayerRaw`.
 */
export type Player = Member

/**
 * A person named at a render site that has no use for their id — the two
 * identity fields a name-and-disc mention draws.
 *
 * Reach for `Member` where a caller holds the id and might need it, and for
 * `Actor` where the value is only ever shown: `DotActor`'s prop, the person a
 * feedback message is about, the player a terminal verdict names, the
 * teammate a waiting line names.
 */
export type Actor = Pick<Member, 'username' | 'color'>

/**
 * A game player's row: a [Member] plus the per-player bits that live on
 * `common.game_players` (as opposed to the profile). Distinct from
 * Member because a chat sender is a Member but never a game player.
 * The shape the games not yet on game_data still read; a game's
 * player comes off that blob as each converts (plans/seat-view.md).
 *
 *   - `player_ended_at` and its reason pair
 *                    — this player stopped playing while the game went
 *                      on: solved, eliminated, out of budget, or
 *                      conceded (reason `conceded`), null if they never
 *                      did (docs/common-schema.md → Not playing any
 *                      more). A player who ended without conceding may
 *                      still win. Presence reads it: nothing is waiting
 *                      for them, so their closed tab must not pause the
 *                      game for everyone still playing.
 *   - `final_ranking` and `outcome`
 *                    — how they came out, both written when the game
 *                      ends and null before it: 1 is `won`, lower is
 *                      `near`, unranked is `lost` or `neutral`.
 *   - `solved_at`    — when they solved, in a game with something to
 *                      solve.
 *   - `player_status`
 *                    — the game's copy of what the page shows about
 *                      this player; each game casts it to its own type.
 *   - `ai_member`    — this seat is one of scrabble's AI opponents.
 *                      A profile fact (`common.profiles.ai_member`)
 *                      rather than a game one, but it sits HERE and
 *                      not on `Member` because only a seated player
 *                      can be a bot: a chat sender, a club roster
 *                      entry and a feedback message's actor are all
 *                      Members and none of them can. What reads it
 *                      is presence — a bot never connects, so it
 *                      must not count toward the pause or draw a
 *                      permanently hollow dot.
 */
export type GamePlayerRow = Member & {
  player_ended_at: string | null
  player_ended_reason: PlayerEndedReason | null
  player_ended_reason_detail: string | null
  final_ranking: number | null
  outcome: EndOutcome | null
  solved_at: string | null
  player_status: Record<string, unknown>
  ai_member: boolean
}

/**
 * Where a player stands — the per-player terms of docs/win-lose.md → Where a
 * player stands, each a formula over the row and the game, computed by
 * `computePlayerStanding` for every seat. A component asks these of a player
 * (`p.isOnTurn`, `gd.me.isOnTurn`) and never compares the turn pointer to an
 * id itself.
 */
export type PlayerStanding = {
  // Walked away from a compete game; never true in coop.
  isConceded: boolean
  // Not playing any more, for whatever reason; the game may go on.
  isLocallyTerminal: boolean
  // The game still wants moves from this player.
  isStillPlaying: boolean
  // Still playing, and the move is theirs.
  isOnTurn: boolean
  // Still playing, and the move is someone else's.
  isWaitingForTurn: boolean
  // The board responds to this player (`draftsOffTurn` keeps it live off-turn).
  isBoardInteractive: boolean
  // Solved, in a game with something to solve. A coop solve stamps every
  // teammate's `solved_at`, so this reads right in both modes.
  hasSolved: boolean
}

/**
 * A game player as the page handed them to a game before the page blobs: the
 * row, and where they stand. The games not yet on `game_data` still read it;
 * a converted game's player is its `GPlayer`, off the blob. `Legacy` so a
 * reader cannot take it for the live shape; it goes with the last unconverted
 * game. A superset of `Member`, so anything typed `Member[]` still accepts it.
 */
export type GamePlayerLegacy = GamePlayerRow & PlayerStanding
