/**
 * The **trace reducer** — strands' entire input model, as one pure function.
 *
 * strands has no text entry at all, which makes it the first game in the roster
 * with none. The reason is specific rather than stylistic: a board repeats
 * letters, so a typed string doesn't identify a path. `PAPARAZZI` on a board
 * with four `A`s is genuinely ambiguous — it matters *which* `A` you meant, and
 * only clicking says that. (Physical keys still do everything else: this is
 * about word entry, not about keyboard support in general.)
 *
 * Keeping the machine pure and separate from the component means the rules can
 * be tested exhaustively without rendering anything, and the component reduces
 * to "draw the trace, forward the clicks".
 *
 * Drag-to-trace is deliberately not built (2026-08-04): it isn't a speed game,
 * click-by-click is simpler, and it can be layered on later as a second way to
 * produce the same actions.
 */

import { adjacent, coordKey, type Coord } from './board'

/** The tiles currently selected, in the order they were clicked. */
export type Trace = readonly Coord[]

/** What a click did. `submit` is the caller's cue to send `trace` to the server. */
export type TraceResult = {
  /** The trace after the click. */
  trace: Trace
  /** True when this click asked to submit — i.e. it re-clicked the last tile. */
  submit: boolean
}

/**
 * Apply one tile click. Four cases, in the order they're checked:
 *
 *  1. **The tile is consumed** (part of a found theme word) — ignored. Those
 *     tiles are spent; a click on one is neither a move nor a mistake, so the
 *     trace is left exactly as it was rather than being cleared out from under
 *     the player.
 *  2. **The tile is the most recent one** — submit. Re-clicking the last tile
 *     is how a word is entered, which is why that tile wears its own marker
 *     (the double ring): without a visible affordance, submission would be
 *     undiscoverable.
 *  3. **The tile is already selected, but isn't the last** — clear everything.
 *     Reaching back into the middle of your own trace means "scrap it".
 *  4. **Otherwise it's a free tile** — extend when it's 8-way adjacent to the
 *     current end, and otherwise **start a new trace there**.
 *
 * That last fallback is the one rule not dictated from the outside, so it is
 * worth stating why: ignoring a far-away click leaves the board feeling dead,
 * while starting fresh matches what the click plainly means ("begin here"). The
 * cost is that a stray click abandons an in-progress trace — acceptable because
 * nothing is lost but the selection, and the alternative trades a real feeling
 * of brokenness for a rare inconvenience.
 */
export function clickTile(
  trace: Trace,
  at: Coord,
  consumed: ReadonlySet<string>,
): TraceResult {
  if (consumed.has(coordKey(at))) return { trace, submit: false }

  const last = trace[trace.length - 1]
  if (last && coordKey(last) === coordKey(at)) return { trace, submit: true }

  if (trace.some((c) => coordKey(c) === coordKey(at))) return { trace: [], submit: false }

  if (last && adjacent(last, at)) return { trace: [...trace, at], submit: false }

  return { trace: [at], submit: false }
}

/** Abandon the current trace (the Escape / click-away path). */
export function clearTrace(): TraceResult {
  return { trace: [], submit: false }
}
