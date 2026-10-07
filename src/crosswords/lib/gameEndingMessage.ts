// cs-unmet

import type { Actor } from '@/common/members/member'
import type { EndOutcome, GameEndedReason } from '@/common/ending/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type EndingMessage,
} from '@/common/ending/endingMessage'

/**
 * What crosswords says once the game is over, for its ending.
 *
 * `pillText` + `outcome` are the verdict in the active-clue bar; `infoColText`
 * + `outcome` are the short line the ending's surfaces show beside it. Both
 * come back in one object so the two cannot disagree. The outcome is MINE, as
 * the database wrote it (`common.game_players.outcome`), never worked out here.
 *
 * Coop is won by completing the grid and lost only to the timer. A race is won
 * by the first correct grid, and lost by everyone to the timer or to every
 * racer conceding. A Stop is the shared neutral ending in both modes.
 *
 * Call it only when the game HAS ended; it has no answer for a live one.
 */
export function buildGameEndingMessage({
  mode,
  gameOutcome,
  reason,
  playerOutcome,
  winner,
}: {
  mode: 'coop' | 'compete'
  // How the game ended, for everyone: won, lost, or `neutral` for a Stop.
  gameOutcome: EndOutcome
  // Why (`common.games.game_ended_reason`).
  reason: GameEndedReason
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // The player ranked first; null when nobody was.
  winner: Actor | null
}): EndingMessage {
  /** The texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Omit<EndingMessage, 'outcome'> {
    if (gameOutcome === 'neutral') return buildGameEndedMessageNeutral(mode)

    if (gameOutcome === 'lost') {
      if (mode === 'coop') {
        // The timer is coop's one loss: there is no concede in coop.
        return { pillText: 'Lost: out of time', infoColText: 'Out of time' }
      }
      if (reason === 'timeout') {
        return { pillText: 'Out of time — no winner', infoColText: 'Out of time' }
      }
      if (reason === 'conceded') {
        return { pillText: 'Lost: all conceded', infoColText: 'All conceded' }
      }
      throw new Error(`BUG: a crosswords race lost for everyone, ended ${reason}`)
    }

    if (mode === 'coop') {
      return { pillText: 'Won: grid complete', infoColText: 'Solved!' }
    }
    if (playerOutcome === 'won') {
      return { pillText: 'Won: solved it first', infoColText: 'You won!' }
    }
    // A race won by someone else: the pill names them as its actor, the way
    // every message names someone.
    return {
      pillText: 'solved it first',
      infoColText: `${winner!.username} won`,
      actor: winner!,
    }
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
