import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, fit, newPrintDoc, savePrint } from '../../common/pdf/frame'
import { drawTurnLog, twoColGeom } from '../../common/pdf/turnLog'
import type { CategoryRank } from '../lib/board'
import type { ConnectionsPrintModel, PrintBand } from './model'

/**
 * connections' print-to-PDF — the **turn-log body family** (docs/pdf.md): the
 * board in the left column, `drawTurnLog` beneath it.
 *
 * The board is the interesting part. On screen it's a single grid whose rows
 * are either a full-width solved-category band or a row of four tiles; that
 * translates directly, with two deliberate changes for paper:
 *
 *  1. **A thick coloured border, not a fill.** A band's colour is a full-bleed
 *     background on screen. Four of those is an enormous amount of ink for a
 *     home printer, and `pdf.md`'s "backgrounds are white" rule already says
 *     don't. The border carries the same hue at a fraction of the cost.
 *  2. **A letter A–D in the top-left.** Colour alone can't be the signal —
 *     mono flattens all four ranks to one grey — and `pdf.md` requires a shape
 *     or text carrying the same meaning. See `model.ts` for why A–D is a
 *     faithful stand-in rather than an arbitrary tag.
 */

/**
 * Print variants of the four rank colours.
 *
 * The screen tokens (`--connections-rank-N`: `#f9df6d` `#a0c35a` `#b0c4ef`
 * `#ba81c5`) are tuned as pale FILLS behind black text. Stroked as a 2.5pt
 * border on white they nearly vanish — pale yellow especially. These are the
 * same four hues taken darker so the border actually reads as a line. Keep the
 * order (rank 0..3 = easiest..hardest) in step with the screen tokens.
 */
const BORDER_RGB: Record<CategoryRank, [number, number, number]> = {
  0: [181, 150, 20], // yellow
  1: [104, 133, 47], // green
  2: [82, 108, 173], // blue
  3: [134, 74, 148], // purple
}

const BAND_BORDER_W = 2.5
const BAND_H = 42
const BAND_GAP = 6
const TILE_H = 26
const COLS = 4

/** Generate the PDF and hand it to the browser as a download. */
export function printConnectionsPdf(m: ConnectionsPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd
  const { leftX, colW, colTop } = twoColGeom(pd)

  drawHeader(pd, m)

  let y = colTop
  m.bands.forEach((b) => {
    drawBand(doc, b, leftX, y, colW)
    y += BAND_H + BAND_GAP
  })
  if (m.remainingTiles.length) y = drawTiles(doc, m.remainingTiles, leftX, y, colW)

  drawTurnLog(pd, {
    startY: y + 14,
    moveLabel: 'Guess',
    rows: m.turns,
    setup: m.setup,
    mode: m.mode,
    emptyText: 'No guesses yet.',
  })

  savePrint(pd, m, 'connections')
}

/**
 * One solved category: a bordered box holding its letter, name and four words.
 * No fill — the border is the whole colour budget.
 */
function drawBand(doc: jsPDF, b: PrintBand, x: number, y: number, w: number): void {
  const [r, g, bl] = BORDER_RGB[b.rank]
  doc.setLineWidth(BAND_BORDER_W).setDrawColor(r, g, bl).rect(x, y, w, BAND_H, 'S')

  // The letter, top-left INSIDE the border — the B&W-safe rank signal. Drawn in
  // the band's own colour so it doubles as a swatch on a colour printer, but it
  // reads perfectly well as a plain bold letter without one.
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(r, g, bl)
  doc.text(b.letter, x + 7, y + 14)

  // Name + members, indented past the letter so nothing collides with it.
  const textX = x + 22
  const textW = w - 28
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text(fit(doc, b.name, textW), textX, y + 15)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
  doc.text(fit(doc, b.tiles.join(' · '), textW), textX, y + 30)
}

/**
 * The tiles still in play, four to a row — bordered white boxes, matching the
 * screen's grid. Dark-grey borders, since an unsolved tile carries no rank and
 * so no colour. Returns the y below the block.
 */
function drawTiles(doc: jsPDF, tiles: string[], x: number, y: number, w: number): number {
  const cellW = w / COLS
  doc.setLineWidth(0.6).setDrawColor(DARK_GREY)
  // ONE size for every tile — the largest that fits the longest word, so the
  // grid reads evenly rather than each cell shrinking to its own content.
  doc.setFont('helvetica', 'bold').setFontSize(9)
  const longest = tiles.reduce((t, w2) => (w2.length > t.length ? w2 : t), '')
  const size = Math.min(9, (9 * (cellW - 8)) / Math.max(doc.getTextWidth(longest), 1))
  tiles.forEach((t, i) => {
    const px = x + (i % COLS) * cellW
    const py = y + Math.floor(i / COLS) * TILE_H
    doc.setDrawColor(DARK_GREY).rect(px, py, cellW, TILE_H, 'S')
    doc.setFontSize(size).setTextColor(BLACK)
    doc.text(t, px + cellW / 2, py + TILE_H / 2 + size * 0.35, { align: 'center' })
  })
  return y + Math.ceil(tiles.length / COLS) * TILE_H
}
