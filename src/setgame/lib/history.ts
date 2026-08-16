import type { Card } from './cards'

/** The minimum a row needs for the replay. Mirrors `EventRow`. */
export type HistoryRow = {
  kind: 'claim' | 'hint'
  cards: Card[]
  /** The board as it stood immediately after this event. */
  board_after: Card[]
}

export type TurnSnapshot = {
  /** The board to render — the table as it was just after this event. */
  board: Card[]
  /** The cards this event was about, ringed on that board. */
  highlight: Card[]
  /** The banner line: what that turn was. */
  description: string
}

/**
 * setgame's turn-history replay: the table as it stood at a past event.
 *
 * **A lookup, not a reconstruction.** The board at event N is derivable — the
 * deck is frozen and the events are ordered — but only by re-running the deal:
 * remove three, refill IN PLACE when under the floor with cards left,
 * TAIL-COMPACT when not, then deal-to-fixpoint appending on the right. Doing
 * that here would put the subtlest logic in the game in two places, with
 * nothing testing that they agree; when they drifted, the viewer would show a
 * board that never existed, which is worse than having no viewer. So the server
 * records `board_after` on every row and this reads it.
 *
 * ── What the viewer is FOR ──────────────────────────────────────────────────
 * The reason this game wants one at all: a claim removes its cards, so the
 * board that held the set is gone the instant someone finds it. "Show me the
 * table where that was" is the natural question afterwards — and for the cards
 * you were shown by a hint, "what else was I looking at?".
 *
 * The highlight is the event's own cards. On a CLAIM those cards are no longer
 * on `board_after` — they left with the claim — so the ring is drawn on the
 * slots they occupied being empty rather than around them. That is honest: it
 * shows the table the moment after, which is what `board_after` means.
 */
export function turnSnapshot(rows: readonly HistoryRow[], index: number): TurnSnapshot | null {
  const row = rows[index]
  if (!row) return null

  return {
    board: row.board_after,
    highlight: row.cards,
    description:
      row.kind === 'claim'
        ? `Turn ${index + 1} — set claimed`
        : `Turn ${index + 1} — hint (${row.cards.length} of 3)`,
  }
}
