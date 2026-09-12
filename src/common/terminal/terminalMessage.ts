// cs-audited-feedback

import type { Outcome } from '../outcomes/outcomes'
import type { Actor } from '../members/member'

/**
 * How a FINISHED game reads: won, lost, or neither.
 *
 * Cut from the outcome vocabulary rather than spelled out, so renaming a member
 * of that list breaks here instead of silently leaving this one behind. The
 * three are a real closed set and not a ceiling nobody revisited — a game that
 * is over has been won, been lost, or was stopped with neither happening, and
 * there is no fourth thing for it to be. (`near` and `warning` judge a MOVE,
 * which is why they cannot appear once there are no more moves.)
 */
export type TerminalOutcome = Extract<Outcome, 'won' | 'lost' | 'neutral'>

/**
 * What a game says once it is over — every game's `buildOver()` returns one.
 *
 * It is a MESSAGE (words plus how they read), not a feedback message: nothing
 * shows it directly. `FeedbackMessage.terminalVerdict(over)` turns it into
 * the below-board pill, and the info column's action row renders
 * `infoColText` itself. Two texts because two surfaces of different width
 * show the same outcome, kept in one object so they cannot disagree.
 */
export type TerminalMessage = {
  // The below-board pill's words — terse, leading with the outcome word
  // ("Won: fewest guesses", "Lost: out of time"), no trailing period: the pill
  // is a one-line, ellipsizing LABEL (~48 chars on a phone), not prose.
  pillText: string
  // The short info-column outcome line ("You won!", "Out of guesses").
  infoColText: string
  // How BOTH surfaces read.
  outcome: TerminalOutcome
  // The person a compete verdict names ("● moth won at Genius"): the pill
  // draws them as the leading mention. Absent when the verdict names nobody.
  actor?: Actor
}

/**
 * The one terminal message every game shares: the friends agreed to stop
 * (`play_state === 'ended'`), so nobody won and nobody lost. Nothing about
 * that outcome is game-specific, which is why it can live here at all.
 *
 * A game may still write its own — boggle does, spending the pill on the
 * tally (`Ended: 12/40`) — so read the game's `buildOver` before assuming.
 */
export function gameEndedTerminalMessage(mode: 'coop' | 'compete'): TerminalMessage {
  return {
    // No trailing period: a pill LABEL, and the rest of the terminal
    // vocabulary ("You win!", "Lost: assassin") doesn't punctuate either.
    pillText: mode === 'coop' ? 'Game ended' : 'Game ended — no winner',
    infoColText: 'Game over',
    outcome: 'neutral',
  }
}
