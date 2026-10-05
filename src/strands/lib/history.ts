// cs-fixed-outcome-fix

import type { GBoard, GEvent, GResult, GTile } from '../types'

/** A past turn, replayed: the board as it stood after it, and its words. */
type HistorySnapshot = {
  // The words found as of the viewed turn, and — on a hint turn — the word it
  // rang. A hint's tiles go here rather than to `litTiles` so the board
  // re-draws them in its own vocabulary — rings, deliberately unconnected —
  // rather than as a traced route: replaying a hint as a trace would show an
  // order the hint never gave you.
  board: GBoard
  // The tiles the viewed guess traced, ringed on the board; empty on a hint
  // turn, which traced nothing.
  litTiles: GTile[]
  // The banner line: what that turn was.
  label: string
}

/** What the banner says about a turn, matching the log's own wording so the two
 *  surfaces can't describe the same row differently. */
const BODY: Record<GResult, string> = {
  spangram: 'spangram',
  theme: 'theme word',
  hint_word: 'valid word',
  duplicate: 'already found',
  too_short: 'too short',
  invalid: 'not a word',
}

/** The label's leading "#N " — empty when the opening carried no log number. */
function makeNumberPrefix(n: number | null): string {
  return n === null ? '' : `#${n} `
}

/**
 * strands' turn-history replay: the board as it stood at a past submission.
 *
 * **A filter, not a reconstruction** — which is unusual, and comes straight from
 * the tiling invariant. strands' board only ever ACCUMULATES: a puzzle word is
 * found once, its tiles lock, and nothing is ever removed or changed. So "the
 * board at turn N" is just "the puzzle words among the first N+1 rows", with no
 * replay of intermediate states at all. Contrast waffle, which re-applies each
 * swap to the scramble, or stackdown, whose tiles vanish.
 *
 * **The boundary is INCLUSIVE**: viewing turn N shows the board *after* that
 * submission, with the cells it traced ringed — "this is what turn N did". That
 * matters most for the rows that changed nothing: a rejected word's cells are
 * exactly what you want to see when reviewing why it failed, and they'd be
 * invisible under an exclusive boundary.
 *
 * Addressed by the ROW'S ID, resolved against `events` — the board's own
 * sequence. The number the log prints counts what the log is SHOWING, which a
 * filter changes; `events` does not, so the two are separate lookups. `n` is
 * that printed number, handed down so the banner echoes what the reader
 * clicked; null drops it from the label. An id these rows do not hold replays
 * nothing.
 */
export function makeHistorySnapshot(
  events: readonly GEvent[],
  id: number,
  n: number | null,
): HistorySnapshot {
  const index = events.findIndex((e) => e.id === id)
  const upTo = index >= 0 ? events.slice(0, index + 1) : []
  const viewed = index >= 0 ? events[index] : undefined

  return {
    board: {
      foundPuzzleWords: upTo
        .filter((e) => e.result === 'theme' || e.result === 'spangram')
        .map((e) => ({ word: e.word!, tiles: e.tiles, spangram: e.result === 'spangram' })),
      hintTiles: viewed?.kind === 'hint' ? viewed.tiles : null,
    },
    litTiles: viewed?.kind === 'guess' ? viewed.tiles : [],
    label: makeLabel(viewed, n),
  }
}

/** The banner's words for a turn. A hint has no word, by design — so the label
 *  names the ACT, and the ring on the board says the rest: "a word" rather
 *  than "a puzzle word", since which word it was is exactly what a hint
 *  withholds. */
function makeLabel(viewed: GEvent | undefined, n: number | null): string {
  if (!viewed) return ''
  if (viewed.kind === 'hint') return `${makeNumberPrefix(n)}Hint — a word was revealed`
  return `${makeNumberPrefix(n)}${viewed.word.toUpperCase()} — ${BODY[viewed.result]}`
}
