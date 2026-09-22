// cs-met-wordle

import {
  gameEndedTerminalMessage,
  type TerminalMessage,
} from '@/common/terminal/terminalMessage'

/**
 * What wordle says once the game is over, for a play state, a mode, the
 * server's reason and what the caller's own row shows.
 *
 * `pillText` + `outcome` are the below-board verdict; `infoColText` + `outcome`
 * are the short, bold, color-coded line in the info column (won = green,
 * lost = red, a manual end = neutral). Both come back in one object so the two
 * surfaces cannot disagree. Coop verdicts are team-wide. Compete is won by
 * fewest guesses with the clock as the tie-break, so its words tell "fewest
 * guesses" from "same guesses, but faster" on both sides of the result — and a
 * race the countdown ended tells a racer still guessing that time ran out,
 * rather than that they were beaten on a count they never finished.
 *
 * Verdicts are terse and unpunctuated ("Lost: out of guesses"), the shared
 * sweep vocabulary — the pill is a fixed-height, ellipsizing row that has to
 * fit a phone (docs/mobile.md → feedback text). Call it only when the game IS
 * terminal; it has no answer for a live one.
 */
export function buildTerminalMessage({
  mode,
  playState,
  reason,
  selfWon,
  selfSolved,
  wonByClock,
  selfTiedWinner,
}: {
  mode: 'coop' | 'compete'
  playState: string
  // WHY it ended — `common.games.status.reason`, written by whichever RPC
  // ended the game: `timeout` (submit_timeout), `conceded` (every racer walked
  // away), `exhausted` (the guesses were spent), `solved`. The club-list label
  // reads the same column, so the two surfaces name one reason.
  reason: string | undefined
  // Compete: is the caller the winner? (Coop verdicts ignore it.)
  selfWon: boolean
  // Compete: had the caller solved it? Tells a racer the clock stopped from
  // one it merely outranked.
  selfSolved: boolean
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
    // lost: the clock, or the guesses (coop cannot concede — End ends it).
    return {
      pillText: reason === 'timeout' ? 'Lost: out of time' : 'Lost: out of guesses',
      infoColText: reason === 'timeout' ? 'Out of time' : 'Out of guesses',
      outcome: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    // A countdown that ran out with a solver on the board is a win by the same
    // rule — fewest guesses among those who finished — but the racer who had
    // not finished was stopped by the clock, not outscored, and a winner with
    // nobody to be fewest than solved in time. A tie broken by solved_at is
    // still a tie, whatever ended the race.
    if (selfWon) {
      return wonByClock
        ? { pillText: 'Won: same guesses, but faster', infoColText: 'You won (faster)', outcome: 'won' }
        : reason === 'timeout'
          ? { pillText: 'Won: solved before time ran out', infoColText: 'You won!', outcome: 'won' }
          : { pillText: 'Won: fewest guesses', infoColText: 'You won!', outcome: 'won' }
    }
    if (selfTiedWinner) {
      return { pillText: 'Lost: beaten on the clock', infoColText: 'Opponent won (faster)', outcome: 'lost' }
    }
    if (reason === 'timeout' && !selfSolved) {
      return { pillText: 'Lost: time ran out', infoColText: 'Opponent won', outcome: 'lost' }
    }
    return { pillText: 'Lost: beaten on guesses', infoColText: 'Opponent won', outcome: 'lost' }
  }
  // lost_compete: the clock, every racer conceded, or the guesses. A MIXED
  // table — one quit, one played it out — is `exhausted`, the server's own call
  // (`_maybe_finish_compete`); the club-list label says the same from the same
  // word. No `Lost:` prefix on any of them — nobody was beaten, the race just
  // ran out.
  return {
    pillText:
      reason === 'timeout' ? 'Out of time — no winner'
      : reason === 'conceded' ? 'All conceded — no winner'
      : 'Nobody solved',
    infoColText:
      reason === 'timeout' ? 'Out of time'
      : reason === 'conceded' ? 'All conceded'
      : 'No winner',
    outcome: 'lost',
  }
}
