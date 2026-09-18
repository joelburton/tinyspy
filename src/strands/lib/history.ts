// cs-fixed-outcome-fix

import type { Coord } from './board'

/** The shape `<Board>` needs for a found word — mirrors `FoundPath`. */
export type FoundPath = { path: Coord[]; isSpangram: boolean }

/** The minimum a row needs for the replay: what it was, and where. Mirrors
 *  `EventRow` — a guess carries a word + verdict, a hint carries neither. */
export type HistoryRow =
  | {
    /** The row's own id — what the viewer addresses. */
    id: number
    kind: 'guess'
    word: string
    path: Coord[]
    result: 'theme' | 'spangram' | 'hint_word' | 'duplicate' | 'too_short' | 'invalid'
  }
  | { id: number; kind: 'hint'; word: null; path: Coord[]; result: null }

export type HistorySnapshot = {
  /** The theme words found as of the viewed turn — feed to `<Board found>`. */
  found: FoundPath[]
  /** The cells the viewed submission traced, ringed on the board. Empty on a
   *  hint turn: a hint traced nothing, and its cells go to `hintCoords`. */
  historyLitTiles: Coord[]
  /**
   * A hint turn's revealed cells, or null on a guess turn. Kept SEPARATE from
   * `historyLitTiles` so the board can re-draw the hint with its own vocabulary —
   * rings, deliberately unconnected — rather than as a traced route. That
   * distinction is the whole reason a hint's coords are stored: replaying it as
   * a trace would show an order the hint never gave you.
   */
  hintCoords: Coord[] | null
  /** The banner line: what that turn was. */
  historyLabel: string
}

/** What the banner says about a turn, matching the log's own wording so the two
 *  surfaces can't describe the same row differently. */
const BODY: Record<Exclude<HistoryRow['result'], null>, string> = {
  spangram: 'spangram',
  theme: 'theme word',
  hint_word: 'valid word',
  duplicate: 'already found',
  too_short: 'too short',
  invalid: 'not a word',
}

/** The label's leading "#N " — empty when the opening carried no log number. */
function numbered(n: number | null): string {
  return n === null ? '' : `#${n} `
}

/**
 * strands' turn-history replay: the board as it stood at a past submission.
 *
 * **A filter, not a reconstruction** — which is unusual, and comes straight from
 * the tiling invariant. strands' board only ever ACCUMULATES: a theme word is
 * found once, its tiles lock, and nothing is ever removed or changed. So "the
 * board at turn N" is just "the theme words among the first N+1 rows", with no
 * replay of intermediate states at all. Contrast waffle, which re-applies each
 * swap to the scramble, or stackdown, whose tiles vanish.
 *
 * **The boundary is INCLUSIVE**: viewing turn N shows the board *after* that
 * submission, with the cells it traced ringed — "this is what turn N did". That
 * matters most for the rows that changed nothing: a rejected word's cells are
 * exactly what you want to see when reviewing why it failed, and they'd be
 * invisible under an exclusive boundary.
 *
 * Addressed by the ROW'S ID, resolved against `rows` — the board's own
 * sequence. The number the log prints counts what the log is SHOWING, which a
 * filter changes; `rows` does not, so the two are separate lookups. `n` is that
 * printed number, handed down so the banner echoes what the reader clicked; null
 * drops it from the label. An id these rows do not hold replays nothing.
 */
export function historySnapshot(
  rows: readonly HistoryRow[],
  id: number,
  n: number | null,
): HistorySnapshot {
  const index = rows.findIndex((r) => r.id === id)
  const upTo = index >= 0 ? rows.slice(0, index + 1) : []
  const viewed = index >= 0 ? rows[index] : undefined
  const isHint = viewed?.kind === 'hint'

  return {
    found: upTo
      .filter((r) => r.result === 'theme' || r.result === 'spangram')
      .map((r) => ({ path: r.path, isSpangram: r.result === 'spangram' })),
    // A hint's cells go to `hintCoords`, never `historyLitTiles` — see HistorySnapshot.
    historyLitTiles: isHint ? [] : (viewed?.path ?? []),
    hintCoords: isHint ? viewed.path : null,
    historyLabel: !viewed
      ? ''
      : viewed.kind === 'hint'
        // No word, by design — so the banner names the ACT, and the ring on the
        // board says the rest. "a word" rather than "a theme word": which word
        // it was is exactly what a hint withholds.
        ? `${numbered(n)}Hint — a word was revealed`
        : `${numbered(n)}${viewed.word.toUpperCase()} — ${BODY[viewed.result]}`,
  }
}
