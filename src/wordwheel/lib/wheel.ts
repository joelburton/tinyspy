// cs-blessed-wordwheel

/**
 * The 9-circle wheel geometry — the single source shared by the on-screen board
 * (`Wheel` / `Tile`, laid out as round boxes) and the PDF export
 * (`printWordwheelPdf`, drawn as jsPDF circles). Keeping it here means the two
 * renderings can never drift.
 *
 * Word wheel's board is one central tile (used in every word) ringed by eight outer
 * tiles — circles, not spellingbee's hexagons. The center tile is drawn LARGER (a
 * separate radius) and, on screen, filled a muted purple; the eight outer tiles sit
 * on a ring evenly spaced, clockwise from the top.
 *
 * Coordinates live in the wheel's own square unit box; a renderer scales that box
 * to its target size — `--u` on screen, a fixed tile width in the PDF.
 */

/** The wheel's coordinate box, a square. Sized so the outer ring plus an outer
 *  tile's radius sit inside the 150-unit half-box, with a few units to spare. */
export const BOX_W = 300
export const BOX_H = 300

/**
 * The ring around a tile, in the same units. It is wide enough that the rings of
 * two touching tiles MERGE, which is what makes the nine circles read as one
 * flower rather than nine coins — so it belongs with the tangency arithmetic
 * below rather than in the stylesheet. (The PDF draws its own hairline: on paper
 * the flower is line art, and a 14-unit band would be a blot.)
 */
export const RING_W = 14

/** How many outer tiles ring the center. Word wheel has exactly eight. */
const OUTER_COUNT = 8

/** Distance from the wheel center to each outer tile's center. Chosen so the
 *  outermost edge (RING_R + OUTER_R) sits inside the 150-unit half-box. */
const RING_R = 105

/**
 * The tiles TOUCH — both each other and the center. Two tangency conditions fix
 * the radii from RING_R (no gaps, no guesswork):
 *
 *   • Adjacent outer tiles are tangent: their centers are a chord
 *     2·RING_R·sin(π/8) apart, so touching means OUTER_R = RING_R·sin(π/8).
 *   • Each outer tile is tangent to the center tile: the center-to-outer
 *     distance is RING_R, so touching means CENTER_R = RING_R − OUTER_R.
 *
 * That makes the center ≈1.6× an outer tile — the "used in every word" hub reads
 * as the biggest tile while every tile kisses its neighbors + the hub.
 */
export const OUTER_R = RING_R * Math.sin(Math.PI / OUTER_COUNT)
export const CENTER_R = RING_R - OUTER_R

/**
 * Each tile's center + radius, in RENDER order: index 0 is the (mandatory) center
 * tile, then the eight outer tiles clockwise from the top (12 o'clock). The board
 * and PDF both map `[centerLetter, ...outerLetters]` onto this array, so a Shuffle
 * of the outer letters visibly rotates them through these eight seats.
 */
export const TILE_POSITIONS: ReadonlyArray<{ cx: number; cy: number; r: number }> =
  buildTilePositions()

function buildTilePositions(): Array<{ cx: number; cy: number; r: number }> {
  const c = BOX_W / 2
  const tiles = [{ cx: c, cy: c, r: CENTER_R }]
  for (let k = 0; k < OUTER_COUNT; k++) {
    // Start at the top (−90°) and step clockwise by an eighth-turn per tile.
    const theta = ((-90 + k * (360 / OUTER_COUNT)) * Math.PI) / 180
    tiles.push({
      cx: c + RING_R * Math.cos(theta),
      cy: c + RING_R * Math.sin(theta),
      r: OUTER_R,
    })
  }
  return tiles
}
