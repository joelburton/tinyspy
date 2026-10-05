// cs-unmet

import type { EndOutcome, PlayerEndedReason } from '@/common/terminal/gameEnding'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'

/**
 * What strands says to a racer who has ended while the others play on.
 *
 * `pillText` + `outcome` are the below-board pill; `infoColText` + `outcome`
 * are the short line in the info column's action row. Call it only while the
 * player has ended and the game has not; once the game ends, its own message
 * (`buildGameEndingMessage`) replaces this one.
 *
 * Two ways out of a race: a solve, which is the GOOD one — the race is won by
 * the fewest hints, decided once everyone stops, so a solver may well be
 * winning — and a concession. The outcome is the one the server wrote
 * (`neutral` for a solve, `lost` for a concession).
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
  if (reason === 'reached_goal') {
    return { pillText: 'Solved — waiting on the rest', infoColText: 'You solved it — waiting', outcome }
  }
  if (reason === 'conceded') {
    return { pillText: 'Conceded — race continues', infoColText: 'You conceded', outcome }
  }
  throw new Error(`BUG: strands has no words for a player who ended ${reason}`)
}
