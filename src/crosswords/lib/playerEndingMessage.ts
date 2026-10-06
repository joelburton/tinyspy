// cs-unmet

import type {
  EndOutcome,
  PlayerEndedReason,
} from '@/common/terminal/gameEnding'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'

/**
 * What crosswords says to a player who has ended while the others race on.
 *
 * `pillText` + `outcome` are the verdict in the active-clue bar;
 * `infoColText` + `outcome` are the line in the strip's action row. Call it
 * only while the player has ended and the game has not; once the game ends,
 * its own message (`buildGameEndingMessage`) replaces this one.
 *
 * A correct grid ends the race for everyone, so the one way out early is
 * conceding. The outcome is the one the server wrote.
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
    return {
      pillText: 'Conceded — race continues',
      infoColText: 'You conceded',
      outcome,
    }
  }
  throw new Error(`BUG: crosswords has no words for a player who ended ${reason}`)
}
