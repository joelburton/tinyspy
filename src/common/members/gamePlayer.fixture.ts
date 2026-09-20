// cs-blessed-members

import type { GamePlayer } from './member'

/**
 * Build a [GamePlayer] for component tests with the per-player state defaulted
 * (still playing, no result — the normal mid-game state). Pass `over` to set
 * `conceded`, `locally_terminal` or `result` for a drop-out, a finished racer
 * or a terminal scenario.
 *
 * Keeps test fixtures from having to spell those fields out on every player
 * literal, and gives the concede tests a one-liner conceded player:
 * `gp('u2', 'moth', 'blue', { conceded: true })`.
 */
export function gp(
  user_id: string,
  username: string,
  color: string,
  over: Partial<
    Pick<GamePlayer, 'conceded' | 'conceded_at' | 'locally_terminal' | 'result' | 'ai_member'>
  > = {},
): GamePlayer {
  return {
    user_id,
    username,
    color,
    conceded: false,
    conceded_at: null,
    locally_terminal: false,
    result: null,
    ai_member: false,
    ...over,
  }
}
