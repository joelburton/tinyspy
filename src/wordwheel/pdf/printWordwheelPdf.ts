import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, newPrintDoc, savePrint, type PrintHeader } from '../../common/pdf/frame'
import { type WordRow } from '../../common/pdf/wordColumns'
import { drawWordListBody } from '../../common/pdf/wordListBody'
import { BOX_H, BOX_W, TILE_POSITIONS } from '../lib/wheel'

/**
 * wordwheel's print-to-PDF, composed from the shared `common/pdf` helpers (docs/pdf.md):
 * the frame (header / Setup / save) + `wordColumns` (the found-words list). It's boggle's
 * shape with a different board: all that's wordwheel-specific is the **wheel** — the
 * 9-circle board drawn from the same `lib/wheel.ts` geometry the on-screen board uses.
 *
 * On the clean-printable page we can't lean on the on-screen red centre tile (the
 * palette is three-shade greyscale — colour only for meaning; see docs/pdf.md), so the
 * centre tile is distinguished the two ways that survive greyscale: it's LARGER (from
 * the geometry) and drawn with a thicker border.
 *
 * The word list uses both `wordColumns` per-row flags: `pangram` → bold (wordwheel's
 * pangrams), `bonus` → a dot (bonus-band finds). At terminal the required-but-missed words
 * fold in as bare rows (`found: null`), from the same reveal the on-screen list uses.
 */

/** The print payload — plain data, built by the caller from the live game state. */
export type WordwheelPrintModel = PrintHeader & {
  /** The 8 outer letters + the mandatory center letter (the wheel). */
  outerLetters: string[]
  centerLetter: string
  /** The word list, ALREADY sorted alphabetically. */
  words: WordRow[]
}

/** Printed width of the whole wheel, in points — fixes the board size (like boggle's
 *  tile size). The wheel's coordinate box is BOX_W wide, so the scale below maps
 *  wheel-units → points. */
const BOARD_W_PT = 150
const OUTER_BORDER_W = 0.8 // outer-tile border weight
const CENTER_BORDER_W = 2 // the center tile's extra distinction: a thicker border

/** Generate the PDF and hand it to the browser as a download. */
export function printWordwheelPdf(m: WordwheelPrintModel): void {
  const pd = newPrintDoc()
  const scale = BOARD_W_PT / BOX_W

  drawHeader(pd, m)

  // The shared word-list body (board top-left / Setup right / words below);
  // wordwheel's only difference is the wheel, drawn via the callback.
  drawWordListBody(pd, m, (x, y) => {
    drawWheel(pd.doc, m.outerLetters, m.centerLetter, x, y, scale)
    return { w: BOX_W * scale, h: BOX_H * scale }
  })

  savePrint(pd, m, 'wordwheel')
}

/** Draw the 9-circle wheel at (x0, y0), `scale` mapping wheel-units → points. Each tile
 *  is a white (paper-backed) circle with a dark-grey border; the center tile (index 0)
 *  is bigger and gets a thicker border — its distinctions on the white page. */
function drawWheel(doc: jsPDF, outer: string[], center: string, x0: number, y0: number, scale: number): void {
  const letters = [center, ...outer]
  letters.forEach((letter, i) => {
    const pos = TILE_POSITIONS[i] ?? TILE_POSITIONS[0]
    const cx = x0 + pos.cx * scale
    const cy = y0 + pos.cy * scale
    const r = pos.r * scale
    doc.setDrawColor(DARK_GREY).setLineWidth(i === 0 ? CENTER_BORDER_W : OUTER_BORDER_W)
    doc.circle(cx, cy, r, 'S')
    // Letter centred in the tile — the centre glyph scaled to its bigger radius.
    const fs = r * 0.9
    doc.setFont('helvetica', 'bold').setFontSize(fs).setTextColor(BLACK)
    doc.text(letter.toUpperCase(), cx, cy + fs * 0.35, { align: 'center' })
  })
}
