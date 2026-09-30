// cs-unmet

import type { EndOutcome, PlayerEndedReason } from '@/common/terminal/gameEnding'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'

/**
 * What psychicnum says to a player who has ended while the others play on,
 * for the reason they ended.
 *
 * `pillText` + `outcome` are the below-board pill; `infoColText` + `outcome`
 * are the short line in the info column's action row. Call it only while the
 * player has ended and the game has not; once the game ends, its own message
 * (`buildGameEndingMessage`) replaces this one.
 *
 * The words come from the reason; the outcome is the one the RPC wrote when
 * the player ended (docs/win-lose.md → `outcome-at-player-end`).
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
  const words = makePlayerEndingWords(reason)
  return { ...words, outcome }
}

/** The two texts, for why I ended. */
function makePlayerEndingWords(
  reason: PlayerEndedReason,
): Pick<TerminalMessage, 'pillText' | 'infoColText'> {
  // A solve and the clock end the game rather than the player, so a player
  // ends on their own only by conceding or spending their budget.
  if (reason === 'conceded') {
    return { pillText: 'Conceded — race continues', infoColText: 'You conceded' }
  } else if (reason === 'resource_exhausted') {
    return { pillText: 'Out of guesses — race continues', infoColText: 'Out of guesses' }
  }

  throw new Error(`BUG: psychicnum has no words for a player who ended by ${reason}`)
}
