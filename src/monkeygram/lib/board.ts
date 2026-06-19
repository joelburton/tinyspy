/**
 * Player-board geometry — the pure layout math ported from the
 * `monkeygram-ui/` prototype (`src/board.js`). No React, no tiles, no
 * server: just "given the placed cells, what window do we render?"
 *
 * THE big idea (see docs/games/monkeygram.md → "The player board"):
 * tiles live at integer (row, col) on an UNBOUNDED plane — including
 * negatives — and the placement set is the only source of truth.
 * Margins, centering, and the viewport are DERIVED here at render time,
 * never stored. That's what makes "recenter and grow" fall out for
 * free, and why placements are a sparse list (not a dense 2D array
 * that would re-base every time the board grows up/left).
 */

export const CELL = 44 // px per cell — fixed, so drag precision is constant
export const MARGIN = 5 // empty cells padded around the extent = the droppable ring
export const MIN_WINDOW = 13 // never render a window smaller than this (cells per side)

/** Just the positional fields computeWindow needs from a placement. */
export type Cell = { row: number; col: number }

export type BoardWindow = {
  /** Logical row/col of the window's top-left cell (can be negative). */
  top: number
  left: number
  /** Window size in cells. */
  rows: number
  cols: number
  /** Bounding box of the placed tiles, or null when the board is empty
   *  — used by the recenter math. */
  extent: { minR: number; maxR: number; minC: number; maxC: number } | null
}

/**
 * Derive the render window from the placements + an optional focus
 * cell (the keyboard cursor).
 *
 * The window is the bounding box of all placed tiles, padded by MARGIN
 * on every side (that ring of empty cells is the droppable growth
 * affordance), expanded to at least MIN_WINDOW per dimension. The
 * `focus` cell is folded in last with ZERO extra margin: the window
 * grows just enough to *contain* the cursor so it never slides off the
 * rendered grid into empty space and vanishes — but we don't pad
 * around it (that would jump the board when you click an empty cell;
 * "keep the cursor visible" scrolling handles framing instead).
 *
 * Pure: same inputs in → same window out. Recomputed every render —
 * that recompute IS the grow-and-recenter behavior.
 */
export function computeWindow(
  placements: Cell[],
  focus: Cell | null = null,
): BoardWindow {
  let top: number, left: number, rows: number, cols: number
  let extent: BoardWindow['extent']

  if (placements.length === 0) {
    const half = Math.floor(MIN_WINDOW / 2)
    top = -half
    left = -half
    rows = MIN_WINDOW
    cols = MIN_WINDOW
    extent = null
  } else {
    let minR = Infinity,
      maxR = -Infinity,
      minC = Infinity,
      maxC = -Infinity
    for (const p of placements) {
      if (p.row < minR) minR = p.row
      if (p.row > maxR) maxR = p.row
      if (p.col < minC) minC = p.col
      if (p.col > maxC) maxC = p.col
    }

    top = minR - MARGIN
    left = minC - MARGIN
    rows = maxR + MARGIN - top + 1
    cols = maxC + MARGIN - left + 1

    // Expand symmetrically up to the minimum so a small board isn't cramped.
    if (rows < MIN_WINDOW) {
      top -= Math.floor((MIN_WINDOW - rows) / 2)
      rows = MIN_WINDOW
    }
    if (cols < MIN_WINDOW) {
      left -= Math.floor((MIN_WINDOW - cols) / 2)
      cols = MIN_WINDOW
    }
    extent = { minR, maxR, minC, maxC }
  }

  // Minimal containment of the cursor cell (no added margin).
  if (focus) {
    if (focus.row < top) {
      rows += top - focus.row
      top = focus.row
    }
    if (focus.col < left) {
      cols += left - focus.col
      left = focus.col
    }
    if (focus.row > top + rows - 1) rows = focus.row - top + 1
    if (focus.col > left + cols - 1) cols = focus.col - left + 1
  }

  return { top, left, rows, cols, extent }
}
