// cs-unmet

/**
 * waffle — the turn-history replay. Given the starting `scramble` and the swap
 * log, reconstruct what the board looked like at any past swap, plus its colors
 * and a historyLabel — so the PlayArea can hand `Board` a historical board the
 * same way it hands it the live one.
 *
 * This is the ADD-style replay (like scrabble's `historyBoard`, unlike stackdown's
 * removal): each swap is a reversible transposition of two cells, so a past board is
 * just `scramble` with the swaps up to that point applied.
 *
 * **The letters are replayed; the colors are READ.** Every swap row carries the
 * board's feedback as of that swap (`waffle.events.colors`, written by
 * `submit_swap`). Replaying letters needs nothing secret, but coloring them
 * needs the solution — so working them out here is what would make the browser
 * hold the answer.
 *
 * **One player's swaps at a time.** Compete logs swaps too since 2026-08-02, so
 * `waffle.events` can hold several players' independent sequences interleaved in
 * one game-wide order. Applying a mixed list to the scramble would
 * produce a board nobody ever saw, so **callers pass an already-filtered list**:
 * coop's shared log, or the rows of whoever wrote the swap being opened.
 *
 * What makes logging compete swaps safe at all is the RLS, not this file: an
 * opponent's rows are invisible until the game ends — replaying them from the
 * shared scramble rebuilds their board, and their green tiles are correct letter
 * positions. See the `events_select` policy.
 *
 * **The boundary is INCLUSIVE**: viewing a swap shows the board *after*
 * that swap, with the two cells it moved ringed — "this is what swap #N did", the
 * natural way to review a move (the cells look identical before a swap; the swap IS
 * the event). Contrast stackdown, which showed the pre-move board because a cleared
 * word's tiles vanish.
 *
 * See docs/games/waffle.md and docs/playarea.md.
 */
import { coord } from './waffle'
import type { EventRow } from '../hooks/useGame'

export interface HistorySnapshot {
  /** The 25-char board AFTER the viewed swap. Feed straight to `<Board board>`. */
  board: string
  /** Its 25-char g/y/x colors, off the swap row — or null when the id named no
   *  row in this list, since then there is no swap whose colors to show and the
   *  grid renders the scramble's letters without color. */
  colors: string | null
  /** The two cells the viewed swap moved — ring these on the board. */
  historyLitTiles: Set<number>
  /** A short, name-free historyLabel of the swap (the log row already shows who). */
  historyLabel: string
}

/**
 * The board `scramble` becomes after applying the swaps at positions `0..index`
 * (INCLUSIVE). Each swap exchanges the letters at its two cells — a pure transposition,
 * so replaying forward from the scramble reconstructs the exact state.
 */
export function historyBoardAfter(
  scramble: string,
  swaps: ReadonlyArray<EventRow>,
  index: number,
): string {
  const b = scramble.split('')
  for (let i = 0; i <= index && i < swaps.length; i++) {
    const { pos_a, pos_b } = swaps[i]
    ;[b[pos_a], b[pos_b]] = [b[pos_b], b[pos_a]]
  }
  return b.join('')
}

/**
 * Reconstruct the board + colors + historyLabel for the swap with this `id`, in
 * a single player's swap log (see the module note — never a mixed list).
 * Addressed by the ROW'S ID, resolved against that list: the number the log
 * prints counts what the log is SHOWING, and a filter moves it.
 */
export function historySnapshot(
  scramble: string,
  swaps: ReadonlyArray<EventRow>,
  id: number,
  n: number | null,
): HistorySnapshot {
  // -1 when the id names a row this list does not hold — a compete opponent's
  // swap, against your own board. The scramble comes back untouched.
  const index = swaps.findIndex((s) => s.id === id)
  const board = historyBoardAfter(scramble, swaps, index)
  const swap = index >= 0 ? swaps[index] : undefined
  return {
    board,
    colors: swap?.colors ?? null,
    historyLitTiles: swap ? new Set([swap.pos_a, swap.pos_b]) : new Set<number>(),
    historyLabel: describe(swap, n),
  }
}

/**
 * The swap label — "#N: A (A1) ↔ B (C2)", matching the log row's
 * letters-and-coords. `n` is the `#N` the log was PRINTING on the row that was
 * clicked, handed down from the viewer, so the banner echoes the number the
 * reader saw rather than counting this list for itself — the two lists differ
 * the moment a filter is on. Null drops the number.
 */
function describe(swap: EventRow | undefined, n: number | null): string {
  if (!swap) return 'This swap'
  const a = `${swap.letter_a.toUpperCase()} (${coord(swap.pos_a)})`
  const b = `${swap.letter_b.toUpperCase()} (${coord(swap.pos_b)})`
  return n === null ? `${a} ↔ ${b}` : `#${n}: ${a} ↔ ${b}`
}
