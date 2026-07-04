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
 *   - **fill** = permanent / authoritative (the game's over);
 *   - **outline** = your own transient move result;
 *   - **sticky** = stays until the next move dismisses it (a keystroke / tile
 *     click routed through `clearLocalFeedback`), as opposed to `timed`.
 *
 * Before this file that contract lived only as ~25 copies-by-convention across
 * the ten games (three of them in per-game `lib/` builders that cross-referenced
 * each other). Centralizing it kills the drift risk. codenamesduet keeps its own
 * `ownAction` builder — it deliberately uses `dismiss: 'timed'`, not sticky.
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
  return { tone, text, variant: 'outline', dismiss: { kind: 'sticky' } }
}

/**
 * The permanent below-board **terminal verdict** pill: **fill** (lightened-tone,
 * reads as final) + sticky (never auto/user-dismissed). Maps the game's
 * won/lost/neutral outcome tone to the feedback palette; the caller owns the
 * text so it can pass `over.verdict`, `over.message`, or a custom reveal (e.g.
 * psychicnum's "The words were …", spellingbee's "Game over — {indicator}").
 */
export function terminalPill(tone: OutcomeTone, text: string): GenericFeedbackMsg {
  return {
    tone: tone === 'won' ? 'success' : tone === 'lost' ? 'error' : 'neutral',
    text,
    variant: 'fill',
    dismiss: { kind: 'sticky' },
  }
}

/**
 * The sticky **"you're out, the others race on"** pill for compete elimination
 * (conceded, or locally done). A neutral `stickyPill` that centralizes the
 * shared conceded copy; the caller passes the still-active-side text, which is
 * genuinely per-game (out of guesses / out of swaps / solved / …). Defaults to
 * the connections/wordle wording when the active side is a plain "you're out".
 */
export function outOfRacePill(
  myConceded: boolean,
  activeText = "You're out — the rest are still racing.",
): GenericFeedbackMsg {
  return stickyPill('neutral', myConceded ? 'You conceded — the rest are still racing.' : activeText)
}
