/**
 * How long the vocabulary's transient marks stay on screen, in milliseconds.
 *
 * These live here rather than in each game because "how long news stays up" is a
 * property of the vocabulary, not of a game — a player who learns the beat in one
 * game should read it in the next. Every game that raises one of these marks uses
 * the same number to take it away again.
 *
 * Each has a twin in common/theme.css (`--mark-attention-flash-duration`,
 * `--mark-your-turn-flash-duration`) driving the CSS animation. CSS cannot hand a
 * duration back to JS, so the pair is kept in step by hand: **change both.** The
 * JS value is what removes the class, so it must be at least the CSS one — a
 * shorter value cuts the animation off mid-fade.
 *
 * See docs/tile-feedback.md.
 */

/** A piece wearing the attention wash: "this changed, look here". */
export const ATTENTION_FLASH_MS = 700

/** The board frame at the moment the turn becomes yours. Slightly longer than
 *  its animation, so the class outlives the fade rather than clipping it. */
export const YOUR_TURN_FLASH_MS = 1200
