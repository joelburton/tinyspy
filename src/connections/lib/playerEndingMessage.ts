// cs-unmet

import type { EndOutcome, PlayerEndedReason } from '@/common/ending/gameEnding'
import type { EndingMessage } from '@/common/ending/endingMessage'

/**
 * What connections says to a racer who is out while the others play on, for
 * the reason they ended.
 *
 * `pillText` + `outcome` are the below-board pill; `infoColText` + `outcome`
 * are the short line in the info column's action row. Call it only while the
 * player has ended and the game has not; once the game ends, its own message
 * (`buildGameEndingMessage`) replaces this one.
 *
 * The words come from the reason; the outcome is the one the RPC wrote when
 * the player ended (docs/win-lose.md → `outcome-at-player-end`): `lost` both
 * ways, since a racer out on mistakes or by concession cannot come back.
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
  function makePlayerEndingWords(): Pick<EndingMessage,'pillText' | 'infoColText'> {
    // Only compete reaches here: a coop player does not end on their own.
    if (reason === 'resource_exhausted') {
      return { pillText: 'Lost — race continues', infoColText: 'You’re out' }
    } else if (reason === 'conceded') {
      return { pillText: 'Conceded — race continues', infoColText: 'You conceded' }
    }

    throw new Error(`BUG: connections has no words for a player who ended by ${reason}`)
  }

  return { ...makePlayerEndingWords(), outcome }
}
