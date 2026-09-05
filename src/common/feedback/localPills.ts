// cs-unmet

import type { ReactNode } from 'react'
import type { Outcome } from '../outcomes/outcomes'
import type { TerminalOutcome } from '../terminal/terminalCopy'
import type { GenericFeedbackMsg } from './genericFeedback'

/**
 * The below-board local-pill builders — one home for the three
 * `GenericFeedbackMsg` shapes a game's PlayArea/BoardCol raises.
 *
 * The below-board slot shows exactly one pill at a time, by priority:
 *   1. the **terminal verdict** (`terminalPill`) — permanent;
 *   2. the **"you're out of the race"** pill (`outOfRacePill`) — permanent, for
 *      a compete player who is locally done while the others race on;
 *   3. the own-move **result** (`stickyPill`) — sticky.
 *
 * The look encodes meaning (see docs/ui.md → Feedback pill):
 *   - **`permanent`** = a standing condition, not a message: the game's over,
 *     or you're out of the race. Nothing dismisses it — a later pill REPLACES
 *     it, which is how out-of-race gives way to the final verdict. It wears the
 *     tinted background that says "this is the state now".
 *   - **`sticky`** = your own transient move result. Stays until the next move
 *     dismisses it — a keystroke, a tile click, or a tap on the pill itself.
 *
 * **The mode is the decision worth getting right, and nothing at runtime checks
 * it.** Filing a standing condition as a message makes a keystroke wipe it, and
 * the player loses the only statement of their own status; filing a message as a
 * condition leaves it on screen after it stops being true. That is what these
 * builders are for — the choice is made once, here, by picking the function.
 *
 * Two pills are deliberately NOT built here, both `timed`: codenamesduet's
 * `ownAction` builder, and letterboxed's accepted-word pill, which occupies the
 * entry's slot and so hands the entry back on its own rather than waiting for a
 * keystroke.
 */

/**
 * Own-move / transient local pill: **outline + sticky**. The one builder for
 * every "here's what your last action did" message — a soft reject, an RPC
 * error, an accepted word.
 */
export function stickyPill(tone: Outcome, text: string): GenericFeedbackMsg {
  return { tone, text, mode: { kind: 'sticky' } }
}

/**
 * The permanent below-board **terminal verdict** pill: **fill** (lightened-tone,
 * reads as final) + sticky (never auto- or user-dismissed).
 *
 * The game's outcome tone IS the pill's tone — the two vocabularies share their
 * names, so there is nothing to translate. The caller owns the content, and can
 * pass `over.verdict`, `over.message`, or a line of its own. It takes a
 * ReactNode rather than a string because a verdict can carry a WIDGET:
 * spellingbee's "● alice won at Genius" leads with the winner's identity dot,
 * the same way peer feedback does elsewhere.
 */
export function terminalPill(tone: TerminalOutcome, text: ReactNode): GenericFeedbackMsg {
  return {
    tone,
    text,
    mode: { kind: 'permanent' },
  }
}

/**
 * The **"you're out, the others race on"** pill for compete elimination —
 * conceded, or locally done. **Permanent**, like the verdict it will be replaced
 * by: being out of the race is a standing condition, and a keystroke must not
 * clear the only statement of your own status.
 *
 * Neutral in tone, because the race is still running and nothing is settled. The
 * conceded wording is shared; the caller passes the still-active-side text,
 * which is genuinely per-game (out of guesses / out of swaps / solved / …) and
 * defaults to the connections/wordle wording for a plain loss.
 *
 * Telegraphic and unpunctuated — "Conceded — race continues", not "You conceded
 * — the rest are still racing." The pill is a fixed-height row that ellipsizes
 * rather than wrapping, and a below-board slot fits ~48 characters on a phone
 * (docs/mobile.md → feedback copy). The subject is obvious (it's YOUR pill, in
 * YOUR below-board slot), so "You" is the first word to go.
 */
export function outOfRacePill(
  myConceded: boolean,
  activeText = 'Lost — race continues',
): GenericFeedbackMsg {
  return {
    tone: 'neutral',
    text: myConceded ? 'Conceded — race continues' : activeText,
    mode: { kind: 'permanent' },
  }
}
