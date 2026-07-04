/**
 * waffle — the turn-history replay. Given the starting `scramble`, the hidden
 * `solution`, and the coop swap log, reconstruct what the board looked like at any
 * past swap, plus its colors and a description — so the PlayArea can hand `WaffleGrid`
 * a historical board the same way it hands it the live one.
 *
 * This is the ADD-style replay (like scrabble's `boardUpToSeq`, unlike stackdown's
 * removal): each swap is a reversible transposition of two cells, so a past board is
 * just `scramble` with the swaps up to that point applied. Colors aren't stored per
 * swap — they're a pure function of `(board, solution)`, recomputed here via the TS
 * `computeColors` port (see lib/colors).
 *
 * **Coop only.** Only coop writes `waffle.swaps` (compete records none — a swap
 * sequence would leak an opponent's hidden board), so there's history to replay only
 * in coop. In coop the board is shared and `swap_index` is a single game-wide ordinal,
 * so — unlike stackdown, whose per-user seq forced a log-position id — a swap's
 * position in the ordered log IS its chronological order; we index the log directly.
 *
 * **The boundary is INCLUSIVE**: viewing the swap at `index` shows the board *after*
 * that swap, with the two cells it moved ringed — "this is what swap #N did", the
 * natural way to review a move (the cells look identical before a swap; the swap IS
 * the event). Contrast stackdown, which showed the pre-move board because a cleared
 * word's tiles vanish.
 *
 * See docs/games/waffle.md and docs/playarea-decomposition-plan.md.
 */
import { coord } from './waffle'
import { computeColors } from './colors'
import type { SwapRow } from '../hooks/useGame'

export interface TurnSnapshot {
  /** The 25-char board AFTER the viewed swap. Feed straight to `<WaffleGrid board>`. */
  board: string
  /** Its 25-char g/y/x colors, or null if the solution isn't available (shouldn't
   *  happen in coop — the grid then renders letters without color). */
  colors: string | null
  /** The two cells the viewed swap moved — ring these on the board. */
  highlight: Set<number>
  /** A short, name-free description of the swap (the log row already shows who). */
  description: string
}

/**
 * The board `scramble` becomes after applying the swaps at positions `0..index`
 * (INCLUSIVE). Each swap exchanges the letters at its two cells — a pure transposition,
 * so replaying forward from the scramble reconstructs the exact state.
 */
export function boardAfter(
  scramble: string,
  swaps: ReadonlyArray<SwapRow>,
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
 * Reconstruct the board + colors + description for the swap at `index` in the coop
 * swap log. An out-of-range `index` (shouldn't happen — the caller passes a real
 * row's position) clamps naturally: past the end applies every swap (the final
 * board), and there's no `swaps[index]`, so the highlight is empty and the
 * description neutral.
 */
export function turnSnapshot(
  scramble: string,
  solution: string | null,
  swaps: ReadonlyArray<SwapRow>,
  index: number,
): TurnSnapshot {
  const board = boardAfter(scramble, swaps, index)
  const swap = swaps[index]
  return {
    board,
    colors: solution ? computeColors(board, solution) : null,
    highlight: swap ? new Set([swap.pos_a, swap.pos_b]) : new Set<number>(),
    description: describe(swap),
  }
}

/** The swap label — "#N: A (A1) ↔ B (C2)", matching the log row's letters-and-coords. */
function describe(swap: SwapRow | undefined): string {
  if (!swap) return 'This swap'
  const a = `${swap.letter_a.toUpperCase()} (${coord(swap.pos_a)})`
  const b = `${swap.letter_b.toUpperCase()} (${coord(swap.pos_b)})`
  return `#${swap.swap_index}: ${a} ↔ ${b}`
}
