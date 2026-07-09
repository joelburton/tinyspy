/**
 * NYT overlay-PNG analysis — ported from crossplay's `nyt.ts`
 * (`detectOverlayMarkings` + `applyOverlayMarkings`).
 *
 * Background: NYT's v6 cell-`type` field is mutually exclusive (1=normal,
 * 2=circled, 3=gray), so it can't represent a cell that is both circled AND
 * shaded — nor can it represent an inter-cell bar at all. When a puzzle needs
 * any of that, NYT bakes the markings into a PNG overlay
 * (`body.overlays.beforeStart` indexes into the response's `assets` array)
 * and composites it over the SVG grid. This module extracts those markings
 * from the decoded pixels.
 *
 * **Pure + decoder-agnostic.** `detectOverlayMarkings` takes a plain
 * `{ width, height, data }` RGBA image, not any PNG-library type — so it's
 * unit-testable without a decoder, and the runtime decoder (pngjs, in the
 * Deno edge function) is the caller's concern. pngjs's own `PNG` object is
 * structurally compatible (it has `.width` / `.height` / `.data`), so the
 * edge fn and the tests can pass it straight in.
 *
 * `.ts` import specifiers (like `nyt.ts`) so this resolves under Deno too.
 */

import type { Cell } from './types.ts'

/** The minimal decoded-image shape the detector needs: RGBA bytes in
 *  row-major order (`data[(y*width + x)*4 + {0..3}]` = R,G,B,A). */
export type DecodedPng = { width: number; height: number; data: Uint8Array }

/** Decoded markings from a NYT overlay PNG.
 *
 *  - `circles`: cells with a theme-marker circle drawn on them (most common
 *    use of the overlay channel — circles-on-shaded cells the per-cell `type`
 *    field can't represent).
 *  - `barsRight` / `barsBottom`: cells with a thick author-drawn line on their
 *    right / bottom edge. NYT uses these in some themed puzzles as a *visual*
 *    separator that doesn't actually break a word (the JSON's `clues` arrays
 *    span across them). Maps directly onto our `markRight` / `markBottom`
 *    "break" marks.
 *
 *  All three sets use `"row,col"` string keys. */
export type OverlayMarkings = {
  circles: Set<string>
  barsRight: Set<string>
  barsBottom: Set<string>
}

/** Decode the raster overlay PNG's markings.
 *
 *  We extract every opaque connected component, then classify by bounding-box
 *  aspect ratio: roughly square → circle; tall+narrow → vertical bar;
 *  short+wide → horizontal bar. Centroids map back to cell positions (for
 *  circles) or to inter-cell boundaries (for bars).
 *
 *  Coordinate model: NYT's SVG uses 33-pixel cells with a 3-pixel border
 *  around the grid (viewBox `0 0 (6+33W) (6+33H)`). The overlay PNG is a
 *  uniform scaling of that viewBox; we derive the scale from the PNG width and
 *  known grid width. Sized correctly for any grid (15×15 daily, 21×21 Sunday).
 *
 *  Tolerant of small artifacts: components under ~50 pixels are rejected (well
 *  below a real circle outline ~85+ px or a real bar ~33+ px at scale=1). */
export function detectOverlayMarkings(
  png: DecodedPng,
  width: number,
  height: number,
): OverlayMarkings {
  // 33-px cells + 3-px border → viewBox span of 6+33*N.
  const viewBoxW = 6 + 33 * width
  const scale = png.width / viewBoxW
  const MIN_COMPONENT_PIXELS = 50
  // Aspect-ratio threshold for "this component is a bar, not a circle". Real
  // bars span the full cell (~33 SVG px) with a stroke of 1–3 px, so
  // height/width is 10+; circles are roughly square (~1). 3× is a safe split
  // that tolerates anti-aliasing fuzz at the bar's ends.
  const BAR_ASPECT_RATIO = 3

  const W = png.width
  const H = png.height
  const visited = new Uint8Array(W * H)
  const alphaAt = (x: number, y: number): number =>
    x < 0 || x >= W || y < 0 || y >= H ? 0 : png.data[(y * W + x) * 4 + 3]!

  const circles = new Set<string>()
  const barsRight = new Set<string>()
  const barsBottom = new Set<string>()
  const stack: number[] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const start = y * W + x
      if (visited[start] || alphaAt(x, y) < 32) continue
      stack.length = 0
      stack.push(start)
      visited[start] = 1
      let sumX = 0, sumY = 0, count = 0
      let minX = x, maxX = x, minY = y, maxY = y
      while (stack.length) {
        const i = stack.pop()!
        const px = i % W
        const py = (i - px) / W
        sumX += px
        sumY += py
        count++
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
        // 4-connected neighbours; diagonal connectivity isn't needed because
        // the outline / bar stroke is thicker than a single pixel.
        if (px + 1 < W) {
          const ni = i + 1
          if (!visited[ni] && alphaAt(px + 1, py) >= 32) { visited[ni] = 1; stack.push(ni) }
        }
        if (px > 0) {
          const ni = i - 1
          if (!visited[ni] && alphaAt(px - 1, py) >= 32) { visited[ni] = 1; stack.push(ni) }
        }
        if (py + 1 < H) {
          const ni = i + W
          if (!visited[ni] && alphaAt(px, py + 1) >= 32) { visited[ni] = 1; stack.push(ni) }
        }
        if (py > 0) {
          const ni = i - W
          if (!visited[ni] && alphaAt(px, py - 1) >= 32) { visited[ni] = 1; stack.push(ni) }
        }
      }
      if (count < MIN_COMPONENT_PIXELS) continue
      const bboxW = maxX - minX + 1
      const bboxH = maxY - minY + 1
      const cxSvg = sumX / count / scale
      const cySvg = sumY / count / scale

      if (bboxH >= BAR_ASPECT_RATIO * bboxW) {
        // Vertical bar on a cell boundary. Centroid x ≈ 3 + 33*b where b is
        // the 1-based boundary index between cols (b-1) and b.
        const boundary = Math.round((cxSvg - 3) / 33)
        const row = Math.floor((cySvg - 3) / 33)
        const leftCol = boundary - 1
        if (row >= 0 && row < height && leftCol >= 0 && leftCol < width - 1) {
          barsRight.add(`${row},${leftCol}`)
        }
      } else if (bboxW >= BAR_ASPECT_RATIO * bboxH) {
        // Horizontal bar on a cell boundary. Mirror of the above on the y-axis.
        const boundary = Math.round((cySvg - 3) / 33)
        const col = Math.floor((cxSvg - 3) / 33)
        const topRow = boundary - 1
        if (col >= 0 && col < width && topRow >= 0 && topRow < height - 1) {
          barsBottom.add(`${topRow},${col}`)
        }
      } else {
        // Approximately square → circle. Centroid is at the cell center, i.e.
        // 3 + 33*(c+0.5).
        const col = Math.round((cxSvg - 3) / 33 - 0.5)
        const row = Math.round((cySvg - 3) / 33 - 0.5)
        if (row >= 0 && row < height && col >= 0 && col < width) {
          circles.add(`${row},${col}`)
        }
      }
    }
  }
  return { circles, barsRight, barsBottom }
}

/** Apply detected overlay markings to a cell grid in place.
 *  - Circles set `circled: true` on the named cell.
 *  - Right/bottom bars set `markRight`/`markBottom` to `"break"` on the named
 *    cell, which renders identically to a player-drawn word-break mark. We
 *    accept that a player could later clear an author-set bar by pressing
 *    `|` / `_`; the alternative (a separate immutable field) didn't seem worth
 *    a Cell-type change for the handful of NYT puzzles that ship bars. */
export function applyOverlayMarkings(cells: Cell[][], m: OverlayMarkings): void {
  for (const key of m.circles) {
    const [r, c] = key.split(',').map(Number) as [number, number]
    const cell = cells[r]?.[c]
    if (cell && cell.kind === 'cell') cell.circled = true
  }
  for (const key of m.barsRight) {
    const [r, c] = key.split(',').map(Number) as [number, number]
    const cell = cells[r]?.[c]
    if (cell && cell.kind === 'cell') cell.markRight = 'break'
  }
  for (const key of m.barsBottom) {
    const [r, c] = key.split(',').map(Number) as [number, number]
    const cell = cells[r]?.[c]
    if (cell && cell.kind === 'cell') cell.markBottom = 'break'
  }
}
