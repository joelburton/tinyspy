// cs-unmet

import type { GEvent, GTile } from '../types'

/** A past turn, as the board draws it. */
type HistorySnapshot = {
  // The table as it was just after this event.
  tiles: GTile[]
  // The tiles this event was about, ringed on that table.
  litTiles: GTile[]
  // The banner line: what that turn was.
  label: string
}

/**
 * setgame's turn-history replay: the table as it stood at a past event.
 *
 * **A lookup, not a reconstruction.** The board at event N is derivable — the
 * deck is frozen and the events are ordered — but only by re-running the deal:
 * remove three, refill IN PLACE when under the floor with tiles left,
 * TAIL-COMPACT when not, then deal-to-fixpoint appending on the right. Doing
 * that here would put the subtlest logic in the game in two places, with
 * nothing testing that they agree; when they drifted, the viewer would show a
 * board that never existed, which is worse than having no viewer. So the server
 * records `board_after` on every row and this reads it (`boardAfter`).
 *
 * ── What the viewer is FOR ──────────────────────────────────────────────────
 * The reason this game wants one at all: a claim removes its tiles, so the
 * board that held the set is gone the instant someone finds it. "Show me the
 * table where that was" is the natural question afterwards — and for the tiles
 * you were shown by a hint, "what else was I looking at?".
 *
 * The lit tiles are the event's own. On a CLAIM those tiles are no longer on
 * `boardAfter` — they left with the claim — so the ring is drawn on the slots
 * they occupied being empty rather than around them. That is honest: it shows
 * the table the moment after, which is what `boardAfter` means.
 */
export function makeHistorySnapshot(
  events: readonly GEvent[],
  id: number,
  n: number | null,
): HistorySnapshot | null {
  // Addressed by the ROW'S ID. setgame's snapshot is the `board_after` stored on
  // the row itself, so any row can be opened whoever played it — the position it
  // happens to sit at in some filtered view names nothing. `n` is the `#N` the
  // log was printing on the clicked row, so the banner says the number the
  // reader saw; null drops it.
  const event = events.find((e) => e.id === id)
  if (event === undefined) return null

  const turn = n === null ? 'Turn' : `Turn ${n}`
  return {
    tiles: event.boardAfter,
    litTiles: event.tiles,
    label:
      event.kind === 'claim'
        ? `${turn} — set claimed`
        : `${turn} — hint (${event.tiles.length} of 3)`,
  }
}
