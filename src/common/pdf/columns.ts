// cs-audited-pdf

import type { PrintDoc } from './frame'

/** Tracks per page. Three is a legibility floor, not a layout preference —
 *  doc.md → Details says why. */
export const MAX_TRACKS = 3

const GUTTER = 18

/** Where one track sits on the page. The caller owns everything inside it. */
export type Track = {
  // Left edge, in points.
  x: number
  // Usable width for this track's content.
  width: number
  // Top edge — the same for every track on a page.
  top: number
  // The y past which this track's content is off the sheet (`pd.pageBottom`).
  bottom: number
}

/**
 * Lay a page out as side-by-side tracks, one per board — the body family for
 * a game where each player has a board of their own and a log that belongs
 * to it. Runs `draw` once per item, adding pages as needed; the caller draws
 * everything inside a track, this only decides where each one starts and how
 * wide it is. Returns the y the tallest track on the LAST page ended at —
 * where `drawSetupBelow` puts the Setup recap — and the page-wide left edge
 * and width, for a caller's own block that spans the page under the columns.
 *
 * Width is computed from the cap, not from how many items this page happens
 * to hold — a four-player game's second page draws its lone track at the same
 * size as the first page's three.
 */
export function drawInTracks<T>(
  pd: PrintDoc,
  items: readonly T[],
  // Draw one track; return the y its content ended at.
  draw: (item: T, track: Track) => number,
  // Tracks per page. A game whose board is wide passes fewer (bananagrams: two).
  maxTracks: number = MAX_TRACKS,
): { bottom: number; left: number; width: number } {
  const usable = pd.pageW - 2 * pd.margin
  const width = (usable - GUTTER * (maxTracks - 1)) / maxTracks
  const top = pd.contentTop

  // Track the tallest column ON THE LAST PAGE — a page break resets it, since
  // the earlier pages' heights say nothing about where this one's content ends.
  let bottom = top
  items.forEach((item, i) => {
    const slot = i % maxTracks
    if (i > 0 && slot === 0) {
      pd.doc.addPage()
      bottom = top
    }
    const end = draw(item, { x: pd.margin + slot * (width + GUTTER), width, top, bottom: pd.pageBottom })
    bottom = Math.max(bottom, end)
  })
  return { bottom, left: pd.margin, width: usable }
}
