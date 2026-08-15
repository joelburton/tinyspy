/**
 * The **trace reducer** — strands' entire input model, as two pure functions:
 * one for a click (`clickTile`), one for a keystroke (`typeLetter`).
 *
 * **strands still takes no typed WORDS**, and the original reason stands: a
 * board repeats letters, so a typed *string* doesn't identify a path.
 * `PAPARAZZI` on a board with four `A`s is genuinely ambiguous — it matters
 * *which* `A` you meant, and a string never says.
 *
 * What `typeLetter` adds is not word entry but **letter-at-a-time cell
 * selection**, which sidesteps that rather than ignoring it: a keystroke is
 * resolved against the cells that could actually come next, and it only moves
 * the trace when exactly one qualifies. So the rule the old design derived from
 * ("a string can't name a path") is refined, not reversed — the disambiguation
 * that used to be "click the letter you meant" now happens per keystroke, and
 * falls back to clicking exactly when it must.
 *
 * That works because of an asymmetry in the board: the FIRST letter of a word
 * competes with all 48 cells and is usually ambiguous, but every letter after it
 * competes only with the ≤8 neighbours of the last cell and is usually unique.
 * In practice you click a word's opening letter and type the rest.
 *
 * Keeping the machine pure and separate from the component means the rules can
 * be tested exhaustively without rendering anything, and the component reduces
 * to "draw the trace, forward the clicks and keys".
 *
 * Drag-to-trace is deliberately not built (2026-08-04): it isn't a speed game,
 * click-by-click is simpler, and it can be layered on later as a second way to
 * produce the same actions.
 */

import { adjacent, coordKey, letterAt, type Board, type Coord } from './board'

/** The tiles currently selected, in the order they were clicked. */
export type Trace = readonly Coord[]

/** What a click did — the trace that should replace the current one.
 *
 *  A click NEVER submits. Re-clicking the last tile used to (2026-08-14), and
 *  the affordance was a misclick magnet: the last tile is the one your cursor
 *  is already on and the one you're most likely to hit while reaching for the
 *  next letter, so a slip sent a half-built word. Submitting is Enter or the
 *  Submit button, both of which are deliberate. */
export type TraceResult = {
  /** The trace after the click. */
  trace: Trace
}

/**
 * Apply one tile click. Four cases, in the order they're checked:
 *
 *  1. **The tile is consumed** (part of a found theme word) — ignored. Those
 *     tiles are spent; a click on one is neither a move nor a mistake, so the
 *     trace is left exactly as it was rather than being cleared out from under
 *     the player.
 *  2. **The tile is already selected** — **truncate** to the prefix before it:
 *     that tile and everything clicked after it are dropped, the earlier tiles
 *     stay. Reaching back into your own trace means "undo back to here", not
 *     "scrap it" — the same rule stackdown's word row uses when you click a
 *     filled slot (an order can't lose a middle piece and keep the rest).
 *
 *     THE LAST TILE IS NOT A SPECIAL CASE, and stopped being one on
 *     2026-08-14. Re-clicking it used to submit; now it takes that letter back
 *     like any other. The old behaviour put a destructive action under the
 *     cursor's most likely resting place — you reach for the next letter,
 *     clip the one you just placed, and a half-built word goes to the server.
 *     Submitting has two deliberate routes (Enter, the Submit button), so it
 *     did not need a third that fires on a slip.
 *  3. **Otherwise it's a free tile** — extend when it's 8-way adjacent to the
 *     current end; otherwise **start a new trace there, discarding whatever was
 *     selected**. The old path is not kept, not merged, and not submitted — a
 *     far click means "begin here", and the board is left showing exactly one
 *     trace of one tile.
 *
 * Ignoring a far click instead would leave the board feeling dead, which is a
 * worse trade than losing a selection that costs one click to rebuild.
 */
export function clickTile(
  trace: Trace,
  at: Coord,
  consumed: ReadonlySet<string>,
): TraceResult {
  if (consumed.has(coordKey(at))) return { trace }

  // No last-tile branch above this: the last tile is found by the same
  // `findIndex` as any other selected tile, and truncates to the prefix
  // before it.
  const seen = trace.findIndex((c) => coordKey(c) === coordKey(at))
  if (seen >= 0) return { trace: trace.slice(0, seen) }

  const last = trace[trace.length - 1]
  if (last && adjacent(last, at)) return { trace: [...trace, at] }

  return { trace: [at] }
}

/** Abandon the current trace (the Escape / click-away path). */
export function clearTrace(): TraceResult {
  return { trace: [] }
}

/**
 * What a typed letter resolved to. Three outcomes, because a keystroke can name
 * a cell, name nothing, or name several:
 *
 *  - `extend` — exactly one cell qualified; `at` is it, and the caller appends.
 *  - `none` — no cell qualified. Almost always a player mistake ("there's no D
 *    next to that letter"), so the caller SAYS so; it is not a silent no-op.
 *  - `ambiguous` — several qualified, and only a click can choose between them.
 *    `candidates` is every one, for the caller to mark on the board.
 */
export type TypeResult =
  | { kind: 'extend'; at: Coord }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: Coord[] }

/**
 * Resolve a typed letter against the board — the keyboard twin of `clickTile`.
 *
 * Which cells are even eligible depends on whether a word is under way, and
 * that's the whole trick (see the module header):
 *
 *  - **Empty trace** → any unconsumed cell bearing the letter. A word can start
 *    anywhere, so this competes with the whole board and is usually ambiguous.
 *  - **Mid-trace** → only cells 8-way ADJACENT to the last one, unconsumed, and
 *    **not already in the trace** (a path can't visit a cell twice — clicking
 *    one of your own cells means "undo back to here", which is a different
 *    action and stays click-only). Eight neighbours minus the ones already used
 *    is a small field, so this is usually unique — which is what makes typing
 *    the rest of a word work.
 *
 * Consumed cells (spent on a found theme word) are excluded throughout, exactly
 * as `clickTile` ignores clicks on them.
 *
 * Note what this deliberately does NOT do: an unmatched letter never restarts
 * the trace somewhere else, the way a far CLICK does. A click names a cell
 * unambiguously; a keystroke doesn't, so jumping the trace across the board on
 * one would be a guess at the player's intent.
 */
export function typeLetter(
  trace: Trace,
  letter: string,
  board: Board,
  consumed: ReadonlySet<string>,
): TypeResult {
  const want = letter.toUpperCase()
  const last = trace[trace.length - 1]
  const inTrace = new Set(trace.map(coordKey))

  const candidates: Coord[] = []
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const at: Coord = [r, c]
      const key = coordKey(at)
      if (consumed.has(key)) continue
      if (letterAt(board, at).toUpperCase() !== want) continue
      if (last) {
        if (inTrace.has(key)) continue
        if (!adjacent(last, at)) continue
      }
      candidates.push(at)
    }
  }

  if (candidates.length === 0) return { kind: 'none' }
  if (candidates.length === 1) return { kind: 'extend', at: candidates[0] }
  return { kind: 'ambiguous', candidates }
}
