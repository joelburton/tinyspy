// cs-met-connections

import {
  gameEndedTerminalMessage,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What connections says once the game is over, for a play state, a mode and
 * what the caller's own row shows.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column (won = green,
 * lost = red, a manual end = neutral). Both come back in one object so the two
 * surfaces cannot disagree. Coop verdicts are team-wide; compete tells the
 * racer who matched all four (the winner) from two losers — eliminated on
 * mistakes, or beaten to the punch by an opponent who finished first.
 *
 * Verdicts are terse and unpunctuated ("Lost: out of mistakes"), the shared
 * sweep vocabulary — the pill is a fixed-height, ellipsizing row that has to
 * fit a phone (docs/mobile.md → feedback text). Call it only when the game IS
 * terminal; it has no answer for a live one.
 */
export function buildTerminalMessage({
  mode,
  playState,
  timerExpired,
  selfWon,
  selfEliminated,
}: {
  mode: 'coop' | 'compete'
  playState: string
  // Did the clock run out? Tells a timeout loss from a mistakes loss.
  timerExpired: boolean
  // Compete: did the caller match all four? (Coop verdicts ignore it.)
  selfWon: boolean
  // Compete: did the caller use all their mistakes? Tells the out-of-mistakes
  // loss from "beaten to the punch".
  selfEliminated: boolean
}): TerminalMessage {
  // Manual end ('ended', written by connections.end_game) is the uniform
  // neutral terminal shared with the other games — the shared message owns it.
  if (playState === 'ended') return gameEndedTerminalMessage(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { pillText: 'You win!', infoColText: 'You won!', outcome: 'won' }
    }
    // lost: the clock, or the mistakes.
    return {
      pillText: timerExpired ? 'Lost: out of time' : 'Lost: out of mistakes',
      infoColText: timerExpired ? 'Out of time' : 'Out of mistakes',
      outcome: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    if (selfWon) {
      return { pillText: 'Won: the race', infoColText: 'You won!', outcome: 'won' }
    }
    if (selfEliminated) {
      return { pillText: 'Lost: out of mistakes', infoColText: 'Out of mistakes', outcome: 'lost' }
    }
    return { pillText: 'Beaten to the punch', infoColText: 'Opponent won', outcome: 'lost' }
  }
  // lost_compete: everyone eliminated, or the clock.
  return {
    pillText: timerExpired ? 'Out of time — no winner' : 'Everyone eliminated',
    infoColText: timerExpired ? 'Out of time' : 'All eliminated',
    outcome: 'lost',
  }
}
