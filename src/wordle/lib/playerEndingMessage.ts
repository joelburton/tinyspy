// cs-unmet

import type { EndOutcome, PlayerEndedReason } from '@/common/ending/gameEnding'
import type { EndingMessage } from '@/common/ending/endingMessage'

/**
 * What wordle says to a player who has ended while the others play on, for
 * the reason they ended.
 *
 * `pillText` + `outcome` are the below-board pill; `infoColText` + `outcome`
 * are the short line in the info column's action row. Call it only while the
 * player has ended and the game has not; once the game ends, its own message
 * (`buildGameEndingMessage`) replaces this one.
 *
 * The words come from the reason; the outcome is the one the RPC wrote when
 * the player ended (docs/win-lose.md → `outcome-at-player-end`): `neutral` for
 * a solve, which fewer guesses may yet beat, and `lost` otherwise.
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
  /** The two texts, for why I ended. */
  function makePlayerEndingWords(): Pick<EndingMessage, 'pillText' | 'infoColText'> {
    // Only compete reaches here: a coop player does not end on their own.
    if (reason === 'reached_goal') {
      return { pillText: 'Solved — waiting on the rest', infoColText: 'Waiting for others' }
    } else if (reason === 'resource_exhausted') {
      return { pillText: 'Out of guesses — waiting', infoColText: 'Waiting for others' }
    } else if (reason === 'conceded') {
      return { pillText: 'Conceded — race continues', infoColText: 'You conceded' }
    }

    throw new Error(`BUG: wordle has no words for a player who ended by ${reason}`)
  }

  return { ...makePlayerEndingWords(), outcome }
}
