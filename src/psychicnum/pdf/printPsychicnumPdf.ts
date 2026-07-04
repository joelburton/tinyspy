import { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, newPrintDoc, savePrint, type PrintHeader } from '../../common/pdf/frame'
import { drawTurnLog, twoColGeom, type TurnRow } from '../../common/pdf/turnLog'

/**
 * psychicnum's print-to-PDF, composed from the shared `common/pdf` helpers (docs/pdf.md):
 * the frame (header / save) + `turnLog` (the newspaper 2-column guess flow). All that's
 * psychicnum-specific is the board.
 *
 * **Success/fail must survive B&W.** psychicnum's tiles carry meaning only in color
 * (green = a secret found, red = a miss). Printed in black-and-white both go grey, so
 * every guessed tile also gets a drawn **shape mark** — a ✓ for a found secret, a ✗
 * for a miss (Helvetica has no ✓/✗ glyphs, so they're drawn from line segments). The
 * shape distinguishes them without color; the fill is a bonus on a color printer.
 */

/** The print payload — plain data, built by the caller from the live game state. */
export type PsychicnumPrintModel = PrintHeader & {
  /** Board tiles in row-major order (uppercased words). */
  board: { word: string; state: 'correct' | 'miss' | 'undecided' }[]
  /** Grid columns (rows derive from `board.length`). */
  cols: number
  /** One row per guess/hint/reveal, already formatted. */
  turns: TurnRow[]
}

// A "normal" cell-border weight, set on EVERY rect so a mark's thicker stroke can't
// leak into the next cell.
const BORDER_W = 0.6
// The ✓ / ✗ marks — green / red on a color printer, distinguished by SHAPE in B&W.
const MARK_CORRECT: [number, number, number] = [46, 106, 42]
const MARK_MISS: [number, number, number] = [150, 45, 45]

/** Generate the PDF and hand it to the browser as a download. */
export function printPsychicnumPdf(m: PsychicnumPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd
  const { leftX, colW, colTop } = twoColGeom(pd)

  drawHeader(pd, m)

  // ── Board (left column): the word-tile grid ──
  const rows = Math.ceil(m.board.length / m.cols)
  const cellW = colW / m.cols
  const cellH = cellW * 0.62
  drawBoard(doc, m, leftX, colTop, cellW, cellH)

  // ── Guesses: the shared newspaper turn flow (labelled "Guess") ──
  drawTurnLog(pd, { startY: colTop + rows * cellH + 26, moveLabel: 'Guess', rows: m.turns, setup: m.setup })

  savePrint(pd, m, 'psychicnum')
}

/** Draw the word-tile grid at (x0, y0). Every tile is a bordered white square (no
 *  fill); a decided tile carries only a top-corner ✓ (found) / ✗ (miss) mark. */
function drawBoard(doc: jsPDF, m: PsychicnumPrintModel, x0: number, y0: number, cellW: number, cellH: number): void {
  const lw0 = doc.getLineWidth()
  // ONE uniform word size for every tile — the largest that fits a 10-letter word in
  // the tile (capped for height). No per-tile shrinking, so the board reads evenly.
  doc.setFont('helvetica', 'bold').setFontSize(10)
  const size = Math.min(cellH * 0.42, (10 * (cellW - 10)) / doc.getTextWidth('WATERMELON'))
  doc.setFontSize(size).setTextColor(BLACK)
  m.board.forEach((tile, i) => {
    const px = x0 + (i % m.cols) * cellW
    const py = y0 + Math.floor(i / m.cols) * cellH
    // Set the border weight on EVERY rect — the marks bump the line width, so a
    // stale value would otherwise thicken every cell after the first marked one.
    doc.setLineWidth(BORDER_W).setDrawColor(DARK_GREY).rect(px, py, cellW, cellH, 'S')
    // Word a hair below center so it clears the top-corner mark.
    doc.text(tile.word, px + cellW / 2, py + cellH / 2 + size * 0.35 + 2, { align: 'center' })
    if (tile.state === 'correct') drawCheck(doc, px, py, cellW, cellH, MARK_CORRECT)
    else if (tile.state === 'miss') drawCross(doc, px, py, cellW, cellH, MARK_MISS)
  })
  doc.setLineWidth(lw0)
}

/** A checkmark in the tile's top-right corner (drawn — Helvetica has no ✓ glyph). */
function drawCheck(doc: jsPDF, px: number, py: number, cw: number, ch: number, color: [number, number, number]): void {
  const s = Math.min(cw, ch) * 0.22
  const mx = px + cw - s - 3
  const my = py + 3
  doc.setDrawColor(...color).setLineWidth(s * 0.18)
  // Down-right to the V, then up-right to the tip.
  doc.lines([[s * 0.28, s * 0.3], [s * 0.55, -s * 0.72]], mx + s * 0.1, my + s * 0.52, [1, 1], 'S')
}

/** A cross in the tile's top-right corner (drawn — Helvetica has no ✗ glyph). */
function drawCross(doc: jsPDF, px: number, py: number, cw: number, ch: number, color: [number, number, number]): void {
  const s = Math.min(cw, ch) * 0.2
  const mx = px + cw - s - 4
  const my = py + 4
  doc.setDrawColor(...color).setLineWidth(s * 0.2)
  doc.line(mx, my, mx + s, my + s)
  doc.line(mx + s, my, mx, my + s)
}
