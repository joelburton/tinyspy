import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, newPrintDoc, savePrint, type PrintHeader } from '../../common/pdf/frame'
import { type WordRow } from '../../common/pdf/wordColumns'
import { drawWordListBody } from '../../common/pdf/wordListBody'
import { BOX_H, BOX_W, HEX_H, HEX_POSITIONS, HEX_SHRINK, HEX_VERTS, HEX_W } from '../lib/honeycomb'

/**
 * spellingbee's print-to-PDF, composed from the shared `common/pdf` helpers (docs/pdf.md):
 * the frame (header / Setup / save) + `wordColumns` (the found-words list). It's boggle's
 * shape with a different board: all that's spellingbee-specific is the **honeycomb** — the
 * 7-hex flower drawn from the same `lib/honeycomb.ts` geometry the on-screen board uses.
 *
 * The word list uses both `wordColumns` per-row flags: `pangram` → bold (spellingbee's
 * pangrams), `bonus` → a dot (bonus-band finds). At terminal the required-but-missed words
 * fold in as bare rows (`found: null`), from the same reveal the on-screen list uses.
 */

/** The print payload — plain data, built by the caller from the live game state. */
export type SpellingbeePrintModel = PrintHeader & {
  /** The 6 outer letters + the mandatory center letter (the honeycomb's flower). */
  outerLetters: string[]
  centerLetter: string
  /** The word list, ALREADY sorted alphabetically. */
  words: WordRow[]
}

const HEX_W_PT = 56 // printed hex width (fixes the board size, like boggle's tile size)
const HEX_BORDER_W = 0.8 // outer-hex border weight
const CENTER_BORDER_W = 2 // the center hex's only distinction: a thicker border

/** Generate the PDF and hand it to the browser as a download. */
export function printSpellingbeePdf(m: SpellingbeePrintModel): void {
  const pd = newPrintDoc()
  const scale = HEX_W_PT / HEX_W

  drawHeader(pd, m)

  // The shared word-list body (board top-left / Setup right / words below);
  // spellingbee's only difference is the honeycomb, drawn via the callback.
  drawWordListBody(pd, m, (x, y) => {
    drawHoneycomb(pd.doc, m.outerLetters, m.centerLetter, x, y, scale)
    return { w: BOX_W * scale, h: BOX_H * scale }
  })

  savePrint(pd, m, 'spellingbee')
}

/** Draw the 7-hex honeycomb at (x0, y0), `scale` mapping flower-units → points. Each hex
 *  is a white (paper-backed) flat-top polygon with a dark-grey border; the center hex
 *  (index 0) gets a thicker border — its only distinction on the white page. */
function drawHoneycomb(doc: jsPDF, outer: string[], center: string, x0: number, y0: number, scale: number): void {
  const letters = [center, ...outer]
  const sw = HEX_W * scale
  const sh = HEX_H * scale
  letters.forEach((letter, i) => {
    const pos = HEX_POSITIONS[i] ?? HEX_POSITIONS[0]
    const px = x0 + pos.left * scale
    const py = y0 + pos.top * scale
    // Absolute vertices (inset toward the hex centre by HEX_SHRINK, matching on-screen).
    const verts = HEX_VERTS.map(([fx, fy]): [number, number] => [
      px + (0.5 + (fx - 0.5) * HEX_SHRINK) * sw,
      py + (0.5 + (fy - 0.5) * HEX_SHRINK) * sh,
    ])
    // jsPDF draws a polyline from a start point via relative deltas; `closed` shuts it.
    const deltas = verts.slice(1).map((v, k): [number, number] => [v[0] - verts[k][0], v[1] - verts[k][1]])
    doc.setDrawColor(DARK_GREY).setLineWidth(i === 0 ? CENTER_BORDER_W : HEX_BORDER_W)
    doc.lines(deltas, verts[0][0], verts[0][1], [1, 1], 'S', true)
    // Letter centred in the hex.
    const fs = sh * 0.5
    doc.setFont('helvetica', 'bold').setFontSize(fs).setTextColor(BLACK)
    doc.text(letter.toUpperCase(), px + sw / 2, py + sh / 2 + fs * 0.35, { align: 'center' })
  })
}
