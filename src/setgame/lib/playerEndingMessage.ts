// cs-unmet

import type { EndOutcome, PlayerEndedReason } from '@/common/terminal/gameEnding'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'

/**
 * What setgame says to a racer who has ended while the others play on.
 *
 * `pillText` + `outcome` are the below-board pill; `infoColText` + `outcome`
 * are the short line in the info column's action row. Call it only while the
 * player has ended and the game has not; once the game ends, its own message
 * (`buildGameEndingMessage`) replaces this one.
 *
 * Nobody finishes a race alone — the deck running dry ends it for everyone —
 * so the one way out early is conceding. The outcome is the one the server
 * wrote.
 */
export function buildPlayerEndingMessage({
  reason,
  outcome,
}: {
  // Why I ended (`common.game_players.player_ended_reason`).
  reason: PlayerEndedReason
  // How I came out (`common.game_players.outcome`).
  outcome: EndOutcome
}): TerminalMessage {
  if (reason === 'conceded') {
    return { pillText: 'Conceded — race continues', infoColText: 'You conceded', outcome }
  }
  throw new Error(`BUG: setgame has no words for a player who ended ${reason}`)
}
