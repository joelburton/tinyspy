// cs-blessed-psychicnum

import type { EndOutcome, GameEnding } from '@/common/ending/gameEnding'
import {
  buildStoppedMessage,
  type EndingMessage,
} from '@/common/ending/endingMessage'

/**
 * What psychicnum says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column (won = green,
 * lost = red, a Stop = neutral). Both come back in one object so the two
 * surfaces cannot disagree.
 *
 * The words come from the game's ending; the outcome is MINE, as the database
 * wrote it (`common.game_players.outcome`), never worked out here.
 *
 * Verdicts are terse and unpunctuated ("Lost: out of guesses"), the shared
 * sweep vocabulary — the pill is a fixed-height, ellipsizing row that has to
 * fit a phone (src/common/feedback/todo.md). Call it only when the game HAS
 * ended; it has no answer for a live one.
 */
export function buildGameEndingMessage({
  mode,
  gameEnding,
  playerOutcome,
  winnerName,
}: {
  mode: 'coop' | 'compete'
  // How the game ended. The reason is the act that ended it — the clock
  // (`timeout`), every player dropping out (`conceded`), the last budget spent
  // (`resource_exhausted`) — and the club-list label reads the same one, so
  // the two surfaces name one reason.
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'>
  // How I came out; null for a club member watching without a seat.
  playerOutcome: EndOutcome | null
  // Compete: the winner's username (for the "X won" message).
  winnerName: string
}): EndingMessage {
  /** The two texts, for the game's ending and whether it went my way. */
  function makeGameEndingWords(): Pick<EndingMessage, 'pillText' | 'infoColText'> {
    // A Stop is the uniform neutral ending shared with the other games — the
    // shared message owns its words.
    if (gameEnding.outcome === 'neutral') return buildStoppedMessage(mode)

    if (mode === 'coop') {
      // Coop cannot concede, so a loss is the clock or the budget.
      if (gameEnding.outcome === 'won') {
        return { pillText: 'Won: all found', infoColText: 'You won!' }
      } else if (gameEnding.reason === 'timeout') {
        return { pillText: 'Lost: out of time', infoColText: 'Timer elapsed' }
      } else if (gameEnding.reason === 'resource_exhausted') {
        return { pillText: 'Lost: out of guesses', infoColText: 'Out of guesses' }
      }
    } else if (mode === 'compete') {
      if (gameEnding.outcome === 'won') {
        if (playerOutcome === 'won') {
          return { pillText: 'Won: the race', infoColText: 'You won!' }
        } else if (playerOutcome === 'lost' || playerOutcome === 'near') {
          return { pillText: 'Beaten to the punch', infoColText: `${winnerName} won` }
        } else if (playerOutcome === null) {
          // SPECTATING: a watcher is told who won, not that they were beaten.
          return { pillText: `${winnerName} won`, infoColText: `${winnerName} won` }
        }
      // Otherwise nobody won.
      } else if (gameEnding.reason === 'timeout') {
        return { pillText: 'Out of time — no winner', infoColText: 'Timer elapsed' }
      } else if (gameEnding.reason === 'conceded') {
        return { pillText: 'All conceded — no winner', infoColText: 'All conceded' }
      } else if (gameEnding.reason === 'resource_exhausted') {
        return { pillText: 'Out of guesses — no winner', infoColText: 'Out of guesses' }
      }
    }

    throw new Error(
      `BUG: psychicnum has no words for a ${mode} ending `
        + `${gameEnding.outcome}/${gameEnding.reason} with player outcome ${playerOutcome}`,
    )
  }

  // SPECTATING: a watcher has no outcome of their own, so the message reads
  // the game's.
  const outcome = playerOutcome ?? gameEnding.outcome
  return { ...makeGameEndingWords(), outcome }
}
