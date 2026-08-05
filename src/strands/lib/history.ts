import type { Coord } from './board'

/** The shape `<Board>` needs for a found word — mirrors `FoundPath`. */
export type FoundPath = { path: Coord[]; isSpangram: boolean }

/** The minimum a row needs for the replay: what it was, and where. Mirrors
 *  `EventRow` — a guess carries a word + verdict, a hint carries neither. */
export type HistoryRow =
  | {
    kind: 'guess'
    word: string
    path: Coord[]
    result: 'theme' | 'spangram' | 'hint_word' | 'duplicate' | 'too_short' | 'invalid'
  }
  | { kind: 'hint'; word: null; path: Coord[]; result: null }

export type TurnSnapshot = {
  /** The theme words found as of the viewed turn — feed to `<Board found>`. */
  found: FoundPath[]
  /** The cells the viewed submission traced, ringed on the board. Empty on a
   *  hint turn: a hint traced nothing, and its cells go to `hintCoords`. */
  highlight: Coord[]
  /**
   * A hint turn's revealed cells, or null on a guess turn. Kept SEPARATE from
   * `highlight` so the board can re-draw the hint with its own vocabulary —
   * rings, deliberately unconnected — rather than as a traced route. That
   * distinction is the whole reason a hint's coords are stored: replaying it as
   * a trace would show an order the hint never gave you.
   */
  hintCoords: Coord[] | null
  /** The banner line: what that turn was. */
  description: string
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
 * `rows` must be the SAME sequence the log is displaying, because the viewer
 * addresses a turn by POSITION. The caller guarantees that by only offering the
 * handle when the log's filter is a no-op (the shared picker's `boardIsShown`).
 */
export function snapshotAt(rows: readonly HistoryRow[], index: number): TurnSnapshot {
  const upTo = rows.slice(0, index + 1)
  const viewed = rows[index]
  const isHint = viewed?.kind === 'hint'

  return {
    found: upTo
      .filter((r) => r.result === 'theme' || r.result === 'spangram')
      .map((r) => ({ path: r.path, isSpangram: r.result === 'spangram' })),
    // A hint's cells go to `hintCoords`, never `highlight` — see TurnSnapshot.
    highlight: isHint ? [] : (viewed?.path ?? []),
    hintCoords: isHint ? viewed.path : null,
    description: !viewed
      ? ''
      : viewed.kind === 'hint'
        // No word, by design — so the banner names the ACT, and the ring on the
        // board says the rest. "a word" rather than "a theme word": which word
        // it was is exactly what a hint withholds.
        ? `#${index + 1} Hint — a word was revealed`
        : `#${index + 1} ${viewed.word.toUpperCase()} — ${BODY[viewed.result]}`,
  }
}
