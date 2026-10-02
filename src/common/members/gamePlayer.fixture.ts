// cs-blessed-members

import type { GamePlayer, Member } from './member'

/**
 * Build a [GamePlayer] for component tests with the per-player state defaulted
 * (still playing in a free-for-all, on turn, unranked, an empty status — the
 * normal mid-game state). Pass `over` to set the ending, the ranking, the
 * `player_status` or the standing for a drop-out, a finished player or an
 * ended game.
 *
 * Keeps test fixtures from having to spell those fields out on every player
 * literal, and gives the concede tests a one-liner conceded player:
 * `gp('u2', 'moth', 'blue', CONCEDED)`.
 */
export function gp(
  id: string,
  username: string,
  color: string,
  over: Partial<Omit<GamePlayer, keyof Member>> = {},
): GamePlayer {
  return {
    id,
    username,
    color,
    player_ended_at: null,
    player_ended_reason: null,
    player_ended_reason_detail: null,
    final_ranking: null,
    outcome: null,
    solved_at: null,
    player_status: {},
    ai_member: false,
    isConceded: false,
    isLocallyTerminal: false,
    isStillPlaying: true,
    isOnTurn: true,
    isWaitingForTurn: false,
    isBoardInteractive: true,
    hasSolved: false,
    ...over,
  }
}

/** The ending columns of a player who conceded, and the standing they imply,
 *  for `gp`'s `over` — `lost` from the moment they conceded, as
 *  `common._concede` writes it. */
export const CONCEDED = {
  player_ended_at: '2026-09-03T00:00:00Z',
  player_ended_reason: 'conceded',
  player_ended_reason_detail: 'conceded',
  outcome: 'lost',
  isConceded: true,
  isLocallyTerminal: true,
  isStillPlaying: false,
  isOnTurn: false,
  isWaitingForTurn: false,
  isBoardInteractive: false,
} as const satisfies Partial<GamePlayer>
