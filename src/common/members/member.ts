// cs-blessed-members

/**
 * Who someone IS — the identity shape every render site in the app shares, and
 * the game-context superset that adds how their game ended.
 *
 * Reach for this whenever you render a person: a chat sender, a club roster
 * row, a player in an OpponentStrip, a name in an event log. `Member` is the
 * three fields you always need; `GamePlayer` adds the three that only exist
 * once someone is seated in a game.
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
  user_id: string
  username: string
  // A palette NAME from `common.profiles.color` — 'red' … 'pink', never a
  // hex. `colorVarFor` resolves it to the fill variable, `borderVarFor` to
  // the paired edge.
  color: string
}

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
 * A game player: a [Member] plus the per-player bits that live on
 * `common.game_players` (as opposed to the profile). Distinct from
 * Member because a chat sender is a Member but never a game player.
 * `GamePlayer` is a superset, so anything typed `Member[]` still
 * accepts `GamePlayer[]` — a game's OpponentStrip / event-log can keep
 * their `Member` props while the PlayArea reads `conceded` off the
 * same roster.
 *
 *   - `conceded`     — this player willfully quit a compete race
 *                      (common.concede) and is out of it, while the
 *                      game continues for everyone still racing. It
 *                      drives the OpponentStrip's "out" marker —
 *                      rendered by each game's own `metricFor`, so
 *                      the strip itself never names this field — and
 *                      the "Quit at …" vs "Lost at …" terminal verb.
 *   - `conceded_at`  — when they quit, or null. Written with the flag
 *                      and cleared with it, so a true `conceded`
 *                      always carries one.
 *   - `locally_terminal`
 *                    — this player is DONE while the game plays on:
 *                      eliminated, out of budget, or finished ahead
 *                      of the others in a best-style race
 *                      (docs/win-lose.md). NOT a second `conceded` —
 *                      a conceder forfeits any win and this player
 *                      may be the winner. What reads it is presence:
 *                      nothing is waiting for them, so their closed
 *                      tab must not pause the game for everyone
 *                      still playing.
 *   - `result`       — the per-player end-state jsonb from
 *                      common.game_players.result; null until the
 *                      game ends.
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
export type GamePlayer = Member & {
  conceded: boolean
  conceded_at: string | null
  locally_terminal: boolean
  result: Record<string, unknown> | null
  ai_member: boolean
}
