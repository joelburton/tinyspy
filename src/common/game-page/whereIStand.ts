// cs-unmet

import type { GamePlayer } from '../members/member'

/** Where the viewing player stands — the terms `GamePageCtx` hands every
 *  PlayArea. Each is defined in docs/win-lose.md → Where a player stands. */
export type Standing = {
  isPlayer: boolean
  isConceded: boolean
  isLocallyTerminal: boolean
  isStillPlaying: boolean
  isMyTurn: boolean
  isWaitingForTurn: boolean
  isBoardInteractive: boolean
}

/**
 * Where the viewing player stands, formula for formula from docs/win-lose.md →
 * Where a player stands. Pure, so the page and a test's context build it the
 * same way: `useCommonGame` calls it for the live page, and a game's tests call
 * it so a fixture that seats a conceder or a teammate on turn reads as the page
 * would read it.
 */
export function whereIStand({
  players,
  myId,
  isTerminal,
  isTurnBased,
  turnHolderId,
  draftsOffTurn,
}: {
  // Everyone in the game, with their `common.game_players` flags.
  players: GamePlayer[]
  // The viewing player's user id.
  myId: string
  // `common.games.is_terminal`.
  isTerminal: boolean
  // The players were seated in a turn order.
  isTurnBased: boolean
  // `common.games.current_turn_user_id`.
  turnHolderId: string | null
  // The manifest's `draftsOffTurn`.
  draftsOffTurn: boolean
}): Standing {
  const me = players.find((p) => p.user_id === myId)
  const isPlayer = me !== undefined
  const isConceded = me?.conceded ?? false
  const isLocallyTerminal = me?.locally_terminal ?? false
  const isStillPlaying = isPlayer && !isTerminal && !isLocallyTerminal
  const isMyTurn = isStillPlaying && (!isTurnBased || turnHolderId === myId)
  const isWaitingForTurn = isStillPlaying && !isMyTurn
  const isBoardInteractive = draftsOffTurn ? isStillPlaying : isMyTurn
  return {
    isPlayer,
    isConceded,
    isLocallyTerminal,
    isStillPlaying,
    isMyTurn,
    isWaitingForTurn,
    isBoardInteractive,
  }
}
