// cs-unmet

import type {
  EndOutcome,
  PlayerEndedReason,
} from '@/common/terminal/gameEnding'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'

/**
 * What stackdown says to a racer who has ended while the others play on.
 *
 * `pillText` + `outcome` are the below-board pill; `infoColText` + `outcome`
 * are the short line in the info column's action row. Call it only while the
 * player has ended and the game has not; once the game ends, its own message
 * (`buildGameEndingMessage`) replaces this one.
 *
 * stackdown has no elimination — nobody runs out of tiles — and a clear ends
 * the race for everyone, so conceding is the one way a racer ends alone. The
 * outcome is the one `common._concede` wrote.
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
  throw new Error(`BUG: stackdown has no words for a player who ended ${reason}`)
}
