/**
 * Player-board geometry — the pure math behind "a gridded board you can't
 * scroll off of, that grows as you place tiles."
 *
 * The model (see docs/games/monkeygram.md → "The player board"):
 *   - Tiles live at integer (row, col) on an unbounded plane (negatives OK);
 *     the sparse placement set is the only source of truth.
 *   - The rendered grid is a **view box** that the component holds in state.
 *     It is THE scrollable area — there is nothing gridded outside it and
 *     nothing blank inside it, so you can only ever scroll over real cells.
 *   - The view box only ever GROWS (monotonic). It starts covering the
 *     viewport and expands to keep the placements + their droppable margin +
 *     the keyboard cursor inside it. It never shrinks or re-centers, so
 *     placing a tile never makes the board jump or slide under you.
 *
 * This file is the pure box algebra; PlayerBoard owns the stateful view box
 * and the scrolling.
 */

export const CELL = 44 // px per cell — fixed, so drag precision is constant
export const MARGIN = 5 // empty droppable cells kept around the placed tiles
export const MIN_VIEW = 13 // floor on the view box per dimension (tiny viewports)

/** A cell's position (the only fields the geometry needs from a placement). */
export type Cell = { row: number; col: number }

/** An axis-aligned block of cells: top-left logical cell + size. */
export type Box = { top: number; left: number; rows: number; cols: number }

export type Extent = { minR: number; maxR: number; minC: number; maxC: number }

/** Bounding box of some cells, or null when there are none. */
export function extentOf(cells: Cell[]): Extent | null {
  if (cells.length === 0) return null
  let minR = Infinity,
    maxR = -Infinity,
    minC = Infinity,
    maxC = -Infinity
  for (const c of cells) {
    if (c.row < minR) minR = c.row
    if (c.row > maxR) maxR = c.row
    if (c.col < minC) minC = c.col
    if (c.col > maxC) maxC = c.col
  }
  return { minR, maxR, minC, maxC }
}

/** The center cell of an extent (or the origin when the board is empty). */
export function centerOf(ext: Extent | null): Cell {
  if (!ext) return { row: 0, col: 0 }
  return { row: (ext.minR + ext.maxR) / 2, col: (ext.minC + ext.maxC) / 2 }
}

/**
 * The cells that MUST be inside the view: every placed tile plus its MARGIN
 * droppable ring, plus the cursor cell. Null when there's nothing to require
 * (empty board, no cursor) — the view's viewport-sized floor covers that.
 */
export function requiredBox(placements: Cell[], cursor: Cell | null): Box | null {
  const ext = extentOf(placements)
  if (!ext && !cursor) return null
  let minR = Infinity,
    maxR = -Infinity,
    minC = Infinity,
    maxC = -Infinity
  if (ext) {
    minR = ext.minR - MARGIN
    maxR = ext.maxR + MARGIN
    minC = ext.minC - MARGIN
    maxC = ext.maxC + MARGIN
  }
  if (cursor) {
    minR = Math.min(minR, cursor.row)
    maxR = Math.max(maxR, cursor.row)
    minC = Math.min(minC, cursor.col)
    maxC = Math.max(maxC, cursor.col)
  }
  return { top: minR, left: minC, rows: maxR - minR + 1, cols: maxC - minC + 1 }
}

/** A box of the given size centered on a cell. */
export function boxAround(center: Cell, rows: number, cols: number): Box {
  return {
    top: Math.round(center.row - rows / 2),
    left: Math.round(center.col - cols / 2),
    rows,
    cols,
  }
}

/** Smallest box containing both (returns `a` unchanged when it already
 *  contains `b`, so callers can cheaply detect "no growth"). */
export function unionBox(a: Box, b: Box): Box {
  const top = Math.min(a.top, b.top)
  const left = Math.min(a.left, b.left)
  const bottom = Math.max(a.top + a.rows - 1, b.top + b.rows - 1)
  const right = Math.max(a.left + a.cols - 1, b.left + b.cols - 1)
  if (top === a.top && left === a.left && bottom === a.top + a.rows - 1 && right === a.left + a.cols - 1) {
    return a
  }
  return { top, left, rows: bottom - top + 1, cols: right - left + 1 }
}

/** Viewport size in whole cells, rounded DOWN (no buffer) so a viewport-sized
 *  grid fits without a scrollbar. A floor of MIN_VIEW guards tiny viewports. */
export function viewportCells(clientW: number, clientH: number): { rows: number; cols: number } {
  return {
    cols: Math.max(MIN_VIEW, Math.floor(clientW / CELL)),
    rows: Math.max(MIN_VIEW, Math.floor(clientH / CELL)),
  }
}

/**
 * The "trimmed" view: the SMALLEST box that frames the current board — the
 * tiles + their margin (+ cursor), expanded only as far as needed to fill the
 * viewport, centered on the tiles. This is what Recenter resets to: it garbage-
 * collects the empty grid that monotonic growth leaves behind. If the tiles fit
 * the viewport → a viewport-sized box (no scrollbars); if not → exactly
 * tiles+margin (scrollable, no waste).
 */
export function trimmedView(
  placements: Cell[],
  cursor: Cell | null,
  vpRows: number,
  vpCols: number,
): Box {
  const center = centerOf(extentOf(placements))
  const vpBox = boxAround(center, vpRows, vpCols)
  const req = requiredBox(placements, cursor)
  return req ? unionBox(vpBox, req) : vpBox
}

/** The initial view box for a freshly-mounted board: a default-desktop-sized
 *  block centered on the placements (or origin), expanded to include the
 *  required cells. The mount effect grows this to the real measured viewport. */
export function initialView(placements: Cell[]): Box {
  const center = centerOf(extentOf(placements))
  const box = boxAround(center, 16, 24) // a laptop-ish default; grown to the real viewport on mount
  const req = requiredBox(placements, null)
  return req ? unionBox(box, req) : box
}
