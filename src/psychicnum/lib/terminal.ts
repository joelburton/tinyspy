// cs-unmet

import {
  gameEndedTerminalMessage,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What psychicnum says once the game is over, for a play state, a mode and the
 * server's reason.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column (won = green,
 * lost = red, a manual end = neutral). Both come back in one object so the two
 * surfaces cannot disagree.
 *
 * Verdicts are terse and unpunctuated ("Lost: out of guesses"), the shared
 * sweep vocabulary — the pill is a fixed-height, ellipsising row that has to
 * fit a phone (docs/mobile.md → feedback text). Call it only when the game IS
 * terminal; it has no answer for a live one.
 */
export function buildTerminalMessage({
  mode,
  playState,
  reason,
  selfWon,
  winnerName,
}: {
  mode: 'coop' | 'compete'
  playState: string
  // WHY it ended — `common.games.status.outcome`, written by whichever RPC
  // ended the game: `timeout` (submit_timeout), `conceded` (every racer
  // dropped out), `exhausted` (the last budget spent). The club-list label
  // reads the same column, so the two surfaces name one reason.
  reason: string | undefined
  // Compete: did the caller complete the set? (Coop verdicts ignore it.)
  selfWon: boolean
  // Compete: the winner's frozen username (for the "X won" message).
  winnerName: string
}): TerminalMessage {
  // Manual end ('ended', written by psychicnum.end_game) is the uniform neutral
  // terminal shared with the other games — the shared message owns it.
  if (playState === 'ended') return gameEndedTerminalMessage(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { pillText: 'Won: all found', infoColText: 'You won!', outcome: 'won' }
    }
    // lost: the clock, or the budget (coop cannot concede).
    return {
      pillText: reason === 'timeout' ? 'Lost: out of time' : 'Lost: out of guesses',
      infoColText: reason === 'timeout' ? 'Timer elapsed' : 'Out of guesses',
      outcome: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { pillText: 'Won: the race', infoColText: 'You won!', outcome: 'won' }
      : { pillText: 'Beaten to the punch', infoColText: `${winnerName} won`, outcome: 'lost' }
  }
  // lost_compete: the clock, every racer conceded, or every budget spent.
  return {
    pillText:
      reason === 'timeout' ? 'Out of time — no winner'
      : reason === 'conceded' ? 'All conceded — no winner'
      : 'Out of guesses — no winner',
    infoColText:
      reason === 'timeout' ? 'Timer elapsed'
      : reason === 'conceded' ? 'All conceded'
      : 'Out of guesses',
    outcome: 'lost',
  }
}
