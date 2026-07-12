/**
 * The 9-circle wheel geometry — the single source shared by the on-screen board
 * (`Wheel` / `Tile`, drawn as SVG) and the PDF export (`printWordwheelPdf`, drawn as
 * jsPDF circles). Keeping it here means the two renderings can never drift.
 *
 * Word wheel's board is one central tile (used in every word) ringed by eight outer
 * tiles — circles, not spellingbee's hexagons. The centre tile is drawn LARGER (a
 * separate radius) and, on screen, filled a saturated red; the eight outer tiles sit
 * on a ring evenly spaced, clockwise from the top.
 *
 * Coordinates live in the wheel's own square unit box (the SVG viewBox); a renderer
 * scales that box to its target size — the SVG to `--u` on screen, the PDF to a fixed
 * tile width.
 */

/** The wheel's coordinate box (a square SVG viewBox). Sized so the outer ring +
 *  each outer tile's radius leave a few units of margin for strokes / focus rings. */
export const BOX_W = 300
export const BOX_H = 300

/** The centre tile's radius, in wheel units — deliberately bigger than an outer
 *  tile (≈1.4×) so the "used in every word" tile reads as the hub. */
export const CENTER_R = 48
/** Each outer tile's radius, in wheel units. Sized so adjacent outer tiles have a
 *  clean gap: at RING_R the eight tiles' centres are a chord ≈81 units apart, so a
 *  34-unit radius (68 diameter) leaves ≈13 units between neighbours. */
export const OUTER_R = 34
/** Distance from the wheel centre to each outer tile's centre. Chosen so the outer
 *  tiles clear the (larger) centre tile with a comfortable gap
 *  (RING_R − CENTER_R − OUTER_R ≈ 24 units) and the outermost edge (RING_R + OUTER_R
 *  = 140) sits inside the 150-unit half-box with a small margin. */
const RING_R = 106
/** How many outer tiles ring the centre. Word wheel has exactly eight. */
const OUTER_COUNT = 8

/**
 * Each tile's centre + radius, in RENDER order: index 0 is the (mandatory) centre
 * tile, then the eight outer tiles clockwise from the top (12 o'clock). The board
 * and PDF both map `[centreLetter, ...outerLetters]` onto this array, so a Shuffle
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
