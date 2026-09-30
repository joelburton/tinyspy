// cs-blessed-feedback

import type { Actor } from '../members/member'
import type { EndOutcome } from './gameEnding'

/**
 * What a game says once it is over. Each game builds its own, in a pure helper
 * its PlayArea calls — `buildTerminalMessage` where a game has been converted
 * to that name, `buildOver` in the games that have not.
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
  outcome: EndOutcome
  // The person a compete verdict names ("● moth won at Genius"): the pill
  // draws them as the leading mention. Absent when the verdict names nobody.
  actor?: Actor
}

/**
 * The message for a NEUTRAL ending, and only that: the friends agreed to stop
 * (the game's ending reason `stopped`), so nobody won and nobody lost. It is
 * never the message for a win or a loss — a game builds those itself. Nothing
 * about the neutral outcome is game-specific, which is why it can live here.
 *
 * A game may still write its own — boggle does, spending the pill on the
 * tally (`Ended: 12 words, 34 points`) — so read the game's own builder
 * before assuming.
 */
export function buildGameEndedMessageNeutral(mode: 'coop' | 'compete'): TerminalMessage {
  return {
    // No trailing period: a pill LABEL, and the rest of the terminal
    // vocabulary ("You win!", "Lost: assassin") doesn't punctuate either.
    pillText: mode === 'coop' ? 'Game ended' : 'Game ended — no winner',
    infoColText: 'Game over',
    outcome: 'neutral',
  }
}
