// cs-met-connections

import {
  gameEndedTerminalMessage,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What connections says once the game is over, for a play state, a mode, the
 * server's reason and what the caller's own row shows.
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
  reason,
  selfWon,
  selfEliminated,
}: {
  mode: 'coop' | 'compete'
  playState: string
  // WHY it ended — `common.games.status.reason`, written by whichever RPC
  // ended the game: `timeout` (submit_timeout), `conceded` (every racer
  // dropped out), `mistakes` (somebody played it out and spent their four).
  // The club-list label reads the same column, so the two surfaces name one
  // reason.
  reason: string | undefined
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
    // lost: the clock, or the mistakes (coop cannot concede — End ends it).
    return {
      pillText: reason === 'timeout' ? 'Lost: out of time' : 'Lost: out of mistakes',
      infoColText: reason === 'timeout' ? 'Out of time' : 'Out of mistakes',
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
  // lost_compete: the clock, every racer conceded, or the mistakes. A MIXED
  // table — someone conceded, someone played it out — is `mistakes`, the
  // server's own call (`connections.concede`), because somebody did play it
  // out; the club-list label says the same thing from the same word.
  return {
    pillText:
      reason === 'timeout' ? 'Out of time — no winner'
      : reason === 'conceded' ? 'All conceded — no winner'
      : 'Everyone eliminated',
    infoColText:
      reason === 'timeout' ? 'Out of time'
      : reason === 'conceded' ? 'All conceded'
      : 'All eliminated',
    outcome: 'lost',
  }
}
