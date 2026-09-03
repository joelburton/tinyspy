// cs-audited-game-lib

/**
 * Who someone IS — the identity shape every render site in the app shares, and
 * the game-context superset that adds how their game ended.
 *
 * Reach for this whenever you render a person: a chat sender, a club roster
 * row, a player in an OpponentStrip, a name in a turn log. `Member` is the
 * three fields you always need; `GamePlayer` adds the two that only exist once
 * someone is seated in a game.
 *
 * **Types only, and that is load-bearing.** `Member` is the single
 * most-imported name in `common/lib/` — 103 files — so a module with no
 * runtime half means all 103 of those imports erase at compile time and cannot
 * participate in an import cycle, whatever else moves later. The two VALUES
 * that read these types live next door in `playerOutcome.ts` precisely so they
 * stay out of this file. Keep it that way: no functions, no constants.
 *
 * The naming convention — `members` in club code, `players` in game code, for
 * the same shape — is docs/naming.md → "member" and "player".
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
  user_id: string
  username: string
  /** Palette name from `common.profiles.color`. Pass through
   *  `colorVarFor` (src/common/lib/color/memberColor.ts) for the
   *  matching CSS variable. */
  color: string
}

/**
 * A game player: a [Member] plus the per-player bits that live on
 * `common.game_players` (as opposed to the profile). Distinct from
 * Member because a chat sender is a Member but never a game player.
 * `GamePlayer` is a superset, so anything typed `Member[]` still
 * accepts `GamePlayer[]` — a game's OpponentStrip / turn-log can keep
 * their `Member` props while the PlayArea reads `conceded` off the
 * same roster.
 *
 *   - `conceded`     — this player willfully quit a compete race
 *                      (common.concede). Drives the OpponentStrip
 *                      "out" marker and the "Quit at …" vs "Lost at
 *                      …" terminal wording.
 *   - `result`       — the per-player end-state jsonb from
 *                      common.game_players.result; null until the
 *                      game ends.
 */
export type GamePlayer = Member & {
  conceded: boolean
  conceded_at: string | null
  result: Record<string, unknown> | null
}
