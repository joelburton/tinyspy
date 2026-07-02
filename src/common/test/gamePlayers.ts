import type { GamePlayer } from '../lib/games'

/**
 * Build a [GamePlayer] for component tests with the per-player concede/result
 * fields defaulted (not conceded, no result — the normal mid-game state). Pass
 * `over` to set `conceded` / `result` for a drop-out or terminal scenario.
 *
 * Keeps test fixtures from having to spell out `conceded/conceded_at/result` on
 * every player literal, and gives the concede tests a one-liner conceded player:
 * `gp('u2', 'moth', 'blue', { conceded: true })`.
 */
export function gp(
  user_id: string,
  username: string,
  color: string,
  over: Partial<Pick<GamePlayer, 'conceded' | 'conceded_at' | 'result'>> = {},
): GamePlayer {
  return {
    user_id,
    username,
    color,
    conceded: false,
    conceded_at: null,
    result: null,
    ...over,
  }
}
