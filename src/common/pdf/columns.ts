import type { PrintDoc } from './frame'

/**
 * Lay a page out as **N side-by-side player tracks**, each getting its own
 * board and its own log.
 *
 * Why this exists rather than reusing `turnLog.ts`'s two-column newspaper flow:
 * that flow is ONE stream wrapping from column to column, which is right when a
 * log is just long. It's wrong for compete in wordle and waffle, where each
 * player has a **separate board** and a log that belongs to it — a wrapped
 * stream would put one player's guesses under another player's grid.
 *
 * **Capped at three per page** (see `MAX_TRACKS`). Compete allows up to six
 * players, and six tracks on a letter page is ~88pt each: a wordle keyboard
 * needs ten keys across, which lands under 9pt per key and stops being readable.
 * Three keeps a two- or three-player game — the realistic case — on one sheet,
 * and spills the rest onto further pages rather than shrinking past legibility.
 */

/** Tracks per page. Three is a legibility floor, not a layout preference. */
export const MAX_TRACKS = 3

const GUTTER = 18

export type Track = {
  /** Left edge, in points. */
  x: number
  /** Usable width for this track's content. */
  width: number
  /** Top edge — the same for every track on a page. */
  top: number
}

/**
 * Run `draw` once per item, laying them out in tracks and adding pages as
 * needed. The caller owns everything inside a track; this only decides where
 * each one starts and how wide it is.
 *
 * Width is computed from `MAX_TRACKS`, **not** from how many items this page
 * happens to hold — so a 4-player game's second page (one lone track) draws its
 * board at the same size as the first page's three, rather than one giant grid
 * beside two normal ones.
 */
export function drawInTracks<T>(
  pd: PrintDoc,
  items: readonly T[],
  draw: (item: T, track: Track, index: number) => void,
): void {
  const usable = pd.pageW - 2 * pd.margin
  const width = (usable - GUTTER * (MAX_TRACKS - 1)) / MAX_TRACKS
  const top = pd.margin + 44 // clears the header, matching twoColGeom's colTop

  items.forEach((item, i) => {
    const slot = i % MAX_TRACKS
    if (i > 0 && slot === 0) pd.doc.addPage()
    draw(item, { x: pd.margin + slot * (width + GUTTER), width, top }, i)
  })
}
