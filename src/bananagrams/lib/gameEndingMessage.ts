// cs-unmet

import type { Actor } from '@/common/members/member'
import type { EndOutcome, GameEndedReason } from '@/common/ending/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type EndingMessage,
} from '@/common/ending/endingMessage'

/**
 * What bananagrams says once the game is over, for its ending.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column. Both come back in
 * one object so the two surfaces cannot disagree. The outcome is MINE, as the
 * database wrote it (`common.game_players.outcome`), never worked out here.
 *
 * A race has one way to be won — a player goes out — and two ways to be lost
 * by everyone: the timer, and every player conceding. A Stop is the shared
 * neutral ending.
 *
 * Call it only when the game HAS ended; it has no answer for a live one.
 */
export function buildGameEndingMessage({
  gameOutcome,
  reason,
  playerOutcome,
  winner,
}: {
  // How the game ended, for everyone: won, lost, or `neutral` for a Stop.
  gameOutcome: EndOutcome
  // Why (`common.games.game_ended_reason`).
  reason: GameEndedReason
  // How I came out, written with the game's ending.
  playerOutcome: EndOutcome
  // The player who went out; null when nobody did.
  winner: Actor | null
}): EndingMessage {
  /** The texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Omit<EndingMessage, 'outcome'> {
    if (gameOutcome ===
      'neutral') return buildGameEndedMessageNeutral('compete')

    if (gameOutcome === 'lost') {
      if (reason === 'timeout') {
        return {
          pillText: '⏰ Time\'s up — no winner',
          infoColText: 'Out of time',
        }
      }
      if (reason === 'conceded') {
        return {
          pillText: '🏳️ All conceded — no winner',
          infoColText: 'All conceded',
        }
      }
      throw new Error(`BUG: a bananagrams race lost for everyone, ended ${reason}`)
    }

    if (playerOutcome === 'won') {
      return {
        pillText: '🍌 Bananas! You went out first',
        infoColText: 'You won!',
      }
    }
    // A won race names its one winner.
    const name = winner!.username
    return {
      pillText: `${name} went out — Bananas!`,
      infoColText: `${name} won`,
    }
  }

  return { ...makeGameEndingWords(), outcome: playerOutcome }
}
