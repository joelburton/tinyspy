// cs-unmet

import type { GamePlayerRow, PlayerStanding } from '../members/member'

/** The game-wide facts a player's standing is computed against. */
export type StandingGame = {
  // The game has ended: it has a `gameEnding`.
  isGameEnded: boolean
  // The players were seated in a turn order.
  isTurnBased: boolean
  // `common.games.current_turn_user_id`.
  turnHolderId: string | null
  // The manifest's `draftsOffTurn`.
  draftsOffTurn: boolean
}

/**
 * Where one player stands, formula for formula from docs/win-lose.md → Where a
 * player stands. Computed for every seat, the viewer's included, so a
 * component asks a PLAYER (`p.isOnTurn`, `gd.me.isOnTurn`) and never compares
 * the turn pointer to an id itself. Pure, so the page and a test's fixture
 * build it the same way: `useCommonGame` calls it for the live page, and
 * `makePlayAreaLoaderProps` calls it so a fixture that seats a conceder or a
 * teammate on turn reads as the page would read it.
 */
export function computePlayerStanding(
  player: GamePlayerRow,
  game: StandingGame,
): PlayerStanding {
  const isConceded = player.player_ended_reason === 'conceded'
  const isLocallyTerminal = player.player_ended_at !== null
  const isStillPlaying = !game.isGameEnded && !isLocallyTerminal
  const isOnTurn = isStillPlaying && (!game.isTurnBased || game.turnHolderId === player.id)
  const isWaitingForTurn = isStillPlaying && !isOnTurn
  const isBoardInteractive = game.draftsOffTurn ? isStillPlaying : isOnTurn
  const hasSolved = player.solved_at !== null
  return {
    isConceded,
    isLocallyTerminal,
    isStillPlaying,
    isOnTurn,
    isWaitingForTurn,
    isBoardInteractive,
    hasSolved,
  }
}
