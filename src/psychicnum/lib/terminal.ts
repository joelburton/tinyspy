// cs-blessed-psychicnum

import type { GameEnding } from '@/common/terminal/gameEnding'
import {
  buildGameEndedMessageNeutral,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What psychicnum says once the game is over, for its ending and mode.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column (won = green,
 * lost = red, a Stop = neutral). Both come back in one object so the two
 * surfaces cannot disagree.
 *
 * Verdicts are terse and unpunctuated ("Lost: out of guesses"), the shared
 * sweep vocabulary — the pill is a fixed-height, ellipsizing row that has to
 * fit a phone (src/common/feedback/todo.md). Call it only when the game HAS
 * ended; it has no answer for a live one.
 */
export function buildTerminalMessage({
  mode,
  gameEnding,
  selfWon,
  winnerName,
}: {
  mode: 'coop' | 'compete'
  // How the game ended. The reason is the act that ended it — the clock
  // (`timeout`), every player dropping out (`conceded`), the last budget spent
  // (`resource_exhausted`) — and the club-list label reads the same one, so
  // the two surfaces name one reason.
  gameEnding: Pick<GameEnding, 'outcome' | 'reason'>
  // Compete: did the caller complete the set? (Coop verdicts ignore it.)
  selfWon: boolean
  // Compete: the winner's username (for the "X won" message).
  winnerName: string
}): TerminalMessage {
  // A Stop is the uniform neutral ending shared with the other games — the
  // shared message owns it.
  if (gameEnding.outcome === 'neutral') return buildGameEndedMessageNeutral(mode)
  if (mode === 'coop') {
    if (gameEnding.outcome === 'won') {
      return { pillText: 'Won: all found', infoColText: 'You won!', outcome: 'won' }
    }
    // lost: the clock, or the budget (coop cannot concede).
    return {
      pillText: gameEnding.reason === 'timeout' ? 'Lost: out of time' : 'Lost: out of guesses',
      infoColText: gameEnding.reason === 'timeout' ? 'Timer elapsed' : 'Out of guesses',
      outcome: 'lost',
    }
  }
  // compete
  if (gameEnding.outcome === 'won') {
    return selfWon
      ? { pillText: 'Won: the race', infoColText: 'You won!', outcome: 'won' }
      : { pillText: 'Beaten to the punch', infoColText: `${winnerName} won`, outcome: 'lost' }
  }
  // lost: the clock, every player conceded, or every budget spent.
  return {
    pillText:
      gameEnding.reason === 'timeout' ? 'Out of time — no winner'
      : gameEnding.reason === 'conceded' ? 'All conceded — no winner'
      : 'Out of guesses — no winner',
    infoColText:
      gameEnding.reason === 'timeout' ? 'Timer elapsed'
      : gameEnding.reason === 'conceded' ? 'All conceded'
      : 'Out of guesses',
    outcome: 'lost',
  }
}
