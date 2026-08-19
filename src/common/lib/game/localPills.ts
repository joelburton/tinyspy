import type { ReactNode } from 'react'
import type { GenericFeedbackMsg, GenericFeedbackTone } from '../games'

/**
 * The below-board local-pill builders — one home for the three
 * `GenericFeedbackMsg` shapes every game's PlayArea/BoardCol was hand-rolling.
 *
 * The below-board slot shows exactly one pill at a time, by priority:
 *   1. the permanent **terminal verdict** (`terminalPill`) — fill, sticky;
 *   2. the sticky **"you're out of the race"** pill (`outOfRacePill`) for a
 *      compete player who's locally done while others race on;
 *   3. the transient **own-move** result (`stickyPill`) — outline, sticky.
 *
 * The look encodes meaning (see docs/ui.md → Feedback pill):
 *   - **`permanent`** = a standing condition, not a message: the game's over,
 *     or you're out of the race. Nothing dismisses it — a later pill REPLACES
 *     it, which is how out-of-race gives way to the final verdict. It wears the
 *     tinted background that says "this is the state now".
 *   - **`sticky`** = your own transient move result. Stays until the next move
 *     dismisses it — a keystroke, a tile click, or a tap on the pill itself.
 *
 * out-of-race was `sticky` until 2026-08-10, which was the one miscategorised
 * pill in the app: a standing condition filed as a message, so a keystroke wiped
 * it and the player lost the only statement of their own status. It was possible
 * to file it wrong because `permanent` had no name — it was spelled as a styling
 * choice (`variant: 'fill'`) beside a behaviour choice.
 *
 * Before this file that contract lived only as ~25 copies-by-convention across
 * the ten games (three of them in per-game `lib/` builders that cross-referenced
 * each other). Centralizing it kills the drift risk. Two deliberate `timed`
 * exceptions build their messages inline instead: codenamesduet's `ownAction`
 * builder, and letterboxed's accepted-word pill (it occupies the entry's slot,
 * so it hands the entry back on its own rather than waiting for a keystroke).
 */

/** A game's terminal outcome tone (`TerminalCopy.tone` / `over.tone`). */
type OutcomeTone = 'won' | 'lost' | 'neutral'

/**
 * Own-move / transient local pill: **outline + sticky**. The one builder for
 * every "here's what your last action did" message (a soft reject, an RPC
 * error, an accepted word). Replaces the per-game `ownMove` / `ownGuess` /
 * `localPill` copies + `useWordSubmit`'s private copy.
 */
export function stickyPill(tone: GenericFeedbackTone, text: string): GenericFeedbackMsg {
  return { tone, text, mode: { kind: 'sticky' } }
}

/**
 * The permanent below-board **terminal verdict** pill: **fill** (lightened-tone,
 * reads as final) + sticky (never auto/user-dismissed). The game's outcome tone
 * IS the pill's tone — no translation, since the pill vocabulary took the
 * outcome names in 2026-08; the caller owns the
 * content so it can pass `over.verdict`, `over.message`, or a custom line. A
 * ReactNode, not just a string, because a verdict can carry a WIDGET —
 * spellingbee's "● alice won at "Genius"" leads with the winner's identity dot,
 * the same way peer feedback does elsewhere.
 */
export function terminalPill(tone: OutcomeTone, text: ReactNode): GenericFeedbackMsg {
  return {
    tone,
    text,
    mode: { kind: 'permanent' },
  }
}

/**
 * The sticky **"you're out, the others race on"** pill for compete elimination
 * (conceded, or locally done). A neutral `stickyPill` that centralizes the
 * shared conceded copy; the caller passes the still-active-side text, which is
 * genuinely per-game (out of guesses / out of swaps / solved / …). Defaults to
 * the connections/wordle wording when the active side is a plain loss.
 *
 * Telegraphic and unpunctuated — "Conceded — race continues", not "You conceded
 * — the rest are still racing." The pill is a fixed-height row that ellipsises
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
