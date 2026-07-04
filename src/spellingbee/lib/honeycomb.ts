/**
 * The 7-hex flat-top honeycomb geometry — the single source shared by the on-screen
 * board (`Letters` / `Letter`, drawn as SVG) and the PDF export (`printSpellingbeePdf`,
 * drawn as jsPDF polygons). Keeping it here means the two renderings can never drift.
 *
 * Coordinates live in the "flower's" own unit box (the SVG viewBox); a renderer scales
 * that box to its target size — the SVG to `--u` on screen, the PDF to a fixed hex width.
 */

/** The flower's coordinate box (the SVG viewBox). */
export const BOX_W = 256
export const BOX_H = 267

/** One flat-top hex, in the flower's units. */
export const HEX_W = 100
export const HEX_H = 87

/** The 6 hex vertices as fractions of the hex box (vertical sides at 25% / 75%) — the
 *  polygon equivalent of `clip-path: polygon(25% 0, 75% 0, 100% 50, 75% 100, 25% 100, 0 50)`. */
export const HEX_VERTS: ReadonlyArray<readonly [number, number]> = [
  [0.25, 0],
  [0.75, 0],
  [1, 0.5],
  [0.75, 1],
  [0.25, 1],
  [0, 0.5],
]

/** Each hex drawn slightly smaller than its cell (inset toward the centre) so the gaps
 *  between adjacent hexes read a touch bigger. Centres/positions are unchanged. */
export const HEX_SHRINK = 0.97

/** Each hex's top-left, in RENDER order: center → top → upper-right → lower-right →
 *  bottom → lower-left → upper-left. Index 0 is the (mandatory) center letter. */
export const HEX_POSITIONS: ReadonlyArray<{ left: number; top: number }> = [
  { left: 78, top: 90 }, //  center
  { left: 78, top: 0 }, //   top
  { left: 156, top: 45 }, // upper-right
  { left: 156, top: 134 }, // lower-right
  { left: 78, top: 180 }, // bottom
  { left: 0, top: 134 }, //  lower-left
  { left: 0, top: 45 }, //   upper-left
]
