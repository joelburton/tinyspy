import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, drawSetup, fit, newPrintDoc, savePrint } from '../../common/pdf/frame'
import { drawInTracks, type Track } from '../../common/pdf/columns'
import { letterCorner, type Tile } from '../lib/board'
import type { PrintTrack, StackdownPrintModel } from './model'

/**
 * stackdown's print-to-PDF — the **track family** (docs/pdf.md; see
 * `common/pdf/columns.ts`): one column per board, each with the word log that
 * belongs to it.
 *
 * Coop is a single track — one shared stack. **Compete gives every player their
 * own stack**, and printing it as one board and one merged log was simply
 * wrong: it showed the viewer's board under a log of everybody's words, so a
 * two-player game looked like one person had played alone. Same reasoning that
 * put wordle and waffle in this family, and the same three-per-page cap.
 *
 * **The stack is the interesting bit, and it prints almost for free.** A
 * mahjong-style board is defined by occlusion — a raised tile hides what's under
 * it — and the house rule that every printed surface is WHITE turns out to be
 * exactly what's needed: a white-filled tile drawn over a lower one occludes it
 * the same way the screen does. So painting the tiles in layer order (`z`
 * ascending, so higher tiles land last) reproduces the stack with no shading at
 * all, and no rule bent to do it.
 *
 * The one thing NOT carried over is the screen's depth ramp (deeper tiles get a
 * warmer shade). That's decoration in print terms — the overlap already says
 * what's on top — and `pdf.md` reserves shades for structure.
 *
 * Letters use the same `letterCorner` the board component does, so a partly
 * covered tile tucks its letter into the same visible quadrant on paper as on
 * screen. Sharing the geometry function is what keeps the two from drifting.
 */

/** Grid geometry, in points. Mirrors the screen's proportions (tile ≈ 1.7× the
 *  step, so raised tiles overlap by roughly half a tile) without importing the
 *  component's pixel constants — print sizes itself to the column, not the
 *  viewport. */
const STEP_RATIO = 32 / 55 // screen STEP / TILE

/** Generate the PDF and hand it to the browser as a download. */
export function printStackdownPdf(m: StackdownPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd

  drawHeader(pd, m)
  const { bottom, left, width } = drawInTracks(pd, m.tracks, (t, track) =>
    drawTrack(doc, t, track),
  )

  // The six words and the setup are page-wide, under the tracks: both describe
  // the GAME, not any one player's board, and repeating them per column would
  // say the same thing three times.
  let y = bottom + 18
  if (m.solution) y = drawSolution(doc, m.solution, left, y, width) + 14
  if (m.setup.length) drawSetup(doc, m.setup, left, y, m.mode)

  savePrint(pd, m, 'stackdown')
}

/** One column: whose board it is, the stack, how far they got, then their words. */
function drawTrack(doc: jsPDF, t: PrintTrack, track: Track): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text(fit(doc, t.who, track.width), track.x, track.top)

  let y = track.top + 10
  y = t.tiles.length
    ? drawStack(doc, t.tiles, track.x, y, track.width) + 12
    : drawCleared(doc, track.x, y) + 12

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
  doc.text(fit(doc, t.result, track.width), track.x, y)
  y += 14

  return drawWordList(doc, t, track, y)
}

/** That board's words, one per line — the per-column log. */
function drawWordList(doc: jsPDF, t: PrintTrack, track: Track, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
  doc.text('Words', track.x, y)
  let cy = y + 12
  if (!t.turns.length) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
    doc.text('None yet.', track.x, cy)
    return cy
  }
  t.turns.forEach((turn) => {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
    doc.text(String(turn.seq), track.x, cy)
    doc.setTextColor(BLACK)
    // Coop's one board is worked by everyone, so its log names who played each
    // word; a compete column is one person's, so the model leaves `who` empty
    // and the line is just the word.
    const line = turn.who ? `${turn.text}  ${turn.who}` : turn.text
    doc.text(fit(doc, line, track.width - 14), track.x + 12, cy)
    cy += 10
  })
  return cy
}

/**
 * The stack. Tiles are drawn in layer order so higher ones paint over lower
 * ones — the white fill IS the occlusion, which is how a printed mahjong board
 * reads as stacked at all. Returns the y below the block.
 */
function drawStack(doc: jsPDF, tiles: Tile[], x0: number, y0: number, colW: number): number {
  const maxX = Math.max(0, ...tiles.map((t) => t.x))
  const maxY = Math.max(0, ...tiles.map((t) => t.y))

  // Size the tile so the whole grid fits the column width. `maxX * step + tile`
  // is the natural width in tile units; solve it for the column.
  const tile = colW / (maxX * STEP_RATIO + 1)
  const step = tile * STEP_RATIO

  // Layer order, then a stable tiebreak so the same board always prints the
  // same way (jsPDF has no z-index — paint order IS the stacking).
  const painted = [...tiles].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)

  doc.setLineWidth(0.6)
  painted.forEach((t) => {
    const px = x0 + t.x * step
    const py = y0 + t.y * step
    // Filled white + a border: the fill hides whatever this tile covers.
    doc.setFillColor(255, 255, 255).setDrawColor(DARK_GREY).rect(px, py, tile, tile, 'FD')

    // Same corner rule as the screen: a covered tile tucks its letter into a
    // quadrant nothing sits over, so it stays readable under the overlap.
    const { cx, cy } = letterCorner(t, tiles)
    const inset = tile * 0.26
    const size = Math.min(11, tile * 0.42)
    doc.setFont('helvetica', 'bold').setFontSize(size).setTextColor(BLACK)
    doc.text(
      t.letter,
      px + tile / 2 + cx * inset,
      py + tile / 2 + cy * inset + size * 0.35,
      { align: 'center' },
    )
  })

  return y0 + maxY * step + tile
}

/** The board once every tile is gone — say so, rather than printing a void. */
function drawCleared(doc: jsPDF, x: number, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(BLACK)
  doc.text('Stack cleared', x, y + 10)
  return y + 14
}

/**
 * The six words, in clearing order — the reveal, and terminal-only (the model
 * won't hand them over before then; the server won't either).
 */
function drawSolution(doc: jsPDF, words: string[], x: number, y: number, colW: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text('The six words', x, y)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(BLACK)
  let cy = y + 15
  // Two columns of three — six short words in one line would crowd the width.
  const half = Math.ceil(words.length / 2)
  words.forEach((w, i) => {
    const col = i < half ? 0 : 1
    const row = i % half
    doc.text(
      `${i + 1}. ${w.toUpperCase()}`,
      x + col * (colW / 2),
      cy + row * 13,
    )
  })
  cy += Math.max(half, 1) * 13
  return cy
}
