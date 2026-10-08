// cs-blessed-manifest

import type { Manifest } from './manifest'

/**
 * The small shared pieces beside `Manifest` (in `manifest.ts`, the class every
 * game's manifest extends and the type the shell reads it as).
 *
 * `CreatedGame` and `GameStopResult` are what its three RPC members answer
 * with; `MODE_LABEL` says a mode to a player; the `playerCount*` helpers format
 * `numberOfPlayers` for the club page. `TimerMode`, the shape of a game's
 * `setup.timer`, is in `types.ts` beside this file.
 */

/**
 * FE-facing labels for a gametype's interaction `mode`.
 */
export const MODE_LABEL: Record<'coop' | 'compete', string> = {
  coop: 'Co-op',
  compete: 'Compete',
}

/**
 * **What every game's `create_game` puts in `data`.** One shape, every
 * schema: `result` names the answer, `id` is the game to go to.
 */
export type CreatedGame = { result: 'created'; id: string }

/**
 * What `stop_game` and `submit_timeout` both answer with: the game is over.
 * ONE result for both, because it is one fact — HOW it came to be over is
 * already in the ending columns of `common.games`, which every surface reads
 * anyway.
 */
export type GameStopResult = { result: 'ended' }

/**
 * Does a player count fall inside a gametype's supported range?
 *
 * ClubPage hands it to the start list as that list's ONE `disabled` predicate,
 * evaluated once per row: the same answer dims the row and declines Enter on
 * it, so a keyboard and a click cannot disagree about which games a club has
 * the members for.
 */
export function playerCountFits(
  range: Manifest['numberOfPlayers'],
  count: number,
): boolean {
  const [min, max] = range
  return count >= min && count <= max
}

/**
 * Human-readable description of the player-count requirement — the start
 * list's `rowTitle`, so hovering a row the club is too small (or too large)
 * for says what it would take.
 *
 *   [2, 2] → "Needs exactly 2 members"
 *   [1, 6] → "Needs 1–6 members"
 */
export function playerCountLabel(
  range: Manifest['numberOfPlayers'],
): string {
  const [min, max] = range
  if (min === max) {
    return `Needs exactly ${min} ${min === 1 ? 'member' : 'members'}`
  }
  return `Needs ${min}–${max} members`
}

/**
 * Compact player-count rendering for a start row's subtle meta line, after
 * the gametype's `shortDescription`. Every row of a club that is not solo
 * shows it.
 *
 *   [2, 2] → "2 players"
 *   [1, 6] → "1–6 players"
 */
export function playerCountShort(
  range: Manifest['numberOfPlayers'],
): string {
  const [min, max] = range
  if (min === max) return `${min} ${min === 1 ? 'player' : 'players'}`
  return `${min}–${max} players`
}
