// cs-met-wordle

import {
  gameEndedTerminalMessage,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What wordle says once the game is over, for a play state, a mode and what
 * the caller's own row shows.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column (won = green,
 * lost = red, a manual end = neutral). Both come back in one object so the two
 * surfaces cannot disagree. Coop verdicts are team-wide. Compete is won by
 * fewest guesses with the clock as the tie-break, so its words tell "fewest
 * guesses" from "same guesses, but faster" on both sides of the result.
 *
 * Verdicts are terse and unpunctuated ("Lost: out of guesses"), the shared
 * sweep vocabulary — the pill is a fixed-height, ellipsizing row that has to
 * fit a phone (docs/mobile.md → feedback text). Call it only when the game IS
 * terminal; it has no answer for a live one.
 */
export function buildTerminalMessage({
  mode,
  playState,
  timerExpired,
  selfWon,
  wonByClock,
  selfTiedWinner,
}: {
  mode: 'coop' | 'compete'
  playState: string
  // Did the clock run out? Tells a timeout loss from a guesses loss.
  timerExpired: boolean
  // Compete: is the caller the winner? (Coop verdicts ignore it.)
  selfWon: boolean
  // Compete: the winner tied another solver on guesses, so the clock decided it.
  wonByClock: boolean
  // Compete: the caller lost specifically on the clock — solved it in the
  // winner's count, later.
  selfTiedWinner: boolean
}): TerminalMessage {
  // Manual end ('ended', written by wordle.end_game) is the uniform neutral
  // terminal shared with the other games — the shared message owns it.
  if (playState === 'ended') return gameEndedTerminalMessage(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { pillText: 'Won: solved it', infoColText: 'Solved it!', outcome: 'won' }
    }
    // lost: the clock, or the guesses.
    return {
      pillText: timerExpired ? 'Lost: out of time' : 'Lost: out of guesses',
      infoColText: timerExpired ? 'Out of time' : 'Out of guesses',
      outcome: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    if (selfWon) {
      return wonByClock
        ? { pillText: 'Won: same guesses, but faster', infoColText: 'You won (faster)', outcome: 'won' }
        : { pillText: 'Won: fewest guesses', infoColText: 'You won!', outcome: 'won' }
    }
    return selfTiedWinner
      ? { pillText: 'Lost: beaten on the clock', infoColText: 'Opponent won (faster)', outcome: 'lost' }
      : { pillText: 'Lost: beaten on guesses', infoColText: 'Opponent won', outcome: 'lost' }
  }
  // lost_compete: nobody solved it, or the clock. No `Lost:` prefix — nobody
  // was beaten, the board just ran out.
  return {
    pillText: timerExpired ? 'Out of time — no winner' : 'Nobody solved',
    infoColText: timerExpired ? 'Out of time' : 'No winner',
    outcome: 'lost',
  }
}
