// cs-blessed-board-marks

/**
 * How long the vocabulary's transient marks stay on screen, and the single home
 * for those numbers.
 *
 * They live here rather than in each game because "how long news stays up" is a
 * property of the vocabulary, not of a game — a player who learns the beat in one
 * game should read it in the next.
 *
 * CSS draws every animated mark and CSS times it: `publishMarkDurations` writes
 * the fade and shake durations below into the tokens the animations read, so the
 * stylesheet has no number of its own to drift from. That is what keeps the
 * halves of one mark together — the attention flash fading and the ink returning
 * from under it are two animations on one duration, and no timer can separate
 * them.
 *
 * `ATTENTION_FLASH_MS` and `YOUR_TURN_FLASH_MS` are for the timers that take a
 * mark's CLASS off afterward. They are the fade plus slack, deliberately:
 * removing the class is what lets the next mark start its animation, and a class
 * removed EARLY cancels the animation mid-fade, while one removed late costs
 * nothing at all now that the visible mark ends on its own.
 */

/** The attention flash: solid for most of it, then a short tail fading out, so the
 *  eye is caught and then handed back the piece's true state color. Short — a
 *  board that sits colored is a board where loud has stopped meaning anything.
 *
 *  Exported because it is also the moment the piece's own color becomes visible,
 *  which is when a mark that comments on that color can start. */
export const ATTENTION_FADE_MS = 250

/** The board frame at the moment the turn becomes yours — a fade-out rather than
 *  a blink: the message is "it just became yours", not "something is wrong". */
const YOUR_TURN_FADE_MS = 2000

/** The head-shake: "not a winning move". A piece taking a good verdict never
 *  wears it, and it never carries the message alone — the piece's own state color
 *  is the half that survives reduced motion. */
export const VERDICT_SHAKE_MS = 400

/** How long a word's ANSWER stays up — the accepted or refused word wearing its
 *  outcome, on whatever surface that game shows a word on: an entry slot, a
 *  guess row, the board tiles the word used.
 *
 *  Longer than the marks that only point at something, because this one is read:
 *  the player checks the word as well as the color. */
export const WORD_ANSWER_MS = 600

/** "Several of these match what you typed — click the one you meant." The mark
 *  that says it is a ring on the candidates, and this is how long it stays.
 *
 *  Longer than the attention flash on purpose: that one announces an event and
 *  is over before you could act on it, while this one asks for an action and has
 *  to survive the reach for the mouse.
 *
 *  Not published to CSS — the mark is a border and a ring with nothing to
 *  animate, so this timer is the only clock it has. */
export const AMBIGUOUS_PICK_FLASH_MS = 800

/** How long a mark's class outlives the animation it started. Enough that an
 *  ordinary timer cannot fire early and clip the fade, small enough that a mark
 *  cannot be re-raised before the class is free again. */
const CLASS_HOLD_SLACK_MS = 100

/** A piece wearing the attention flash: "this changed, look here". */
export const ATTENTION_FLASH_MS = ATTENTION_FADE_MS + CLASS_HOLD_SLACK_MS

/** The board frame at the moment the turn becomes yours. */
export const YOUR_TURN_FLASH_MS = YOUR_TURN_FADE_MS + CLASS_HOLD_SLACK_MS

/**
 * The lifetime that is NOT a duration: a mark with no clock, standing until the
 * action that answers it clears it. It lives here with the beats because it is
 * one of the choices a caller makes about how long news stays up, and reading
 * `useMark(NO_TIMER)` beside `useMark(WORD_ANSWER_MS)` is how a caller sees that.
 */
export const NO_TIMER: unique symbol = Symbol('NO_TIMER')

/**
 * Hand the durations to the stylesheet, on the document root. Call once at
 * startup, from main.tsx — before the first board can render a mark.
 *
 * The tokens are declared nowhere else, so the marks are drawn by whatever this
 * publishes. A mark whose duration never arrives does not animate, and every
 * mark is written to be invisible rather than stuck in that case.
 */
export function publishMarkDurations(): void {
  const root = document.documentElement.style
  root.setProperty('--mark-attention-flash-duration', `${ATTENTION_FADE_MS}ms`)
  root.setProperty('--mark-yourTurn-flash-duration', `${YOUR_TURN_FADE_MS}ms`)
  root.setProperty('--mark-verdict-shake-duration', `${VERDICT_SHAKE_MS}ms`)
}
