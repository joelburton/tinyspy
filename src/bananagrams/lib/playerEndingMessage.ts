// cs-unmet

import type {
  EndOutcome,
  PlayerEndedReason,
} from '@/common/ending/gameEnding'
import type { EndingMessage } from '@/common/ending/endingMessage'

/**
 * What bananagrams says to a player who has ended while the others race on.
 *
 * `pillText` + `outcome` are the below-board pill; `infoColText` + `outcome`
 * are the short line in the info column's action row. Call it only while the
 * player has ended and the game has not; once the game ends, its own message
 * (`buildGameEndingMessage`) replaces this one.
 *
 * Going out ends the race for everyone, so the one way out early is conceding.
 * The outcome is the one the server wrote.
 */
export function buildPlayerEndingMessage({
  reason,
  outcome,
}: {
  // Why I ended (`common.game_players.player_ended_reason`).
  reason: PlayerEndedReason
  // How I came out (`common.game_players.outcome`).
  outcome: EndOutcome
}): EndingMessage {
  if (reason === 'conceded') {
    return {
      pillText: 'Conceded — race continues',
      infoColText: 'You conceded',
      outcome,
    }
  }
  throw new Error(`BUG: bananagrams has no words for a player who ended ${reason}`)
}
