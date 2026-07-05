import { BLACK, DARK_GREY, drawHeader, newPrintDoc, savePrint, type PrintHeader } from '../../common/pdf/frame'
import { type WordRow } from '../../common/pdf/wordColumns'
import { drawWordListBody } from '../../common/pdf/wordListBody'
import type { jsPDF } from 'jspdf'

/**
 * boggle's print-to-PDF, composed from the shared `common/pdf` helpers (docs/pdf.md):
 * the frame (header / Setup / save) + `wordColumns` (the found-words list). All that's
 * boggle-specific is the board — a FIXED-size tile grid (a 6×6 prints bigger than a
 * 4×4; it isn't scaled to a column) with the Setup to its right, and the word list
 * below in 4 columns. At terminal the required-but-missed words fold in as bare rows
 * (`found: null`); the FE builds that list from the same reveal the on-screen list uses.
 */

/** The print payload — plain data, built by the caller from the live game state. */
export type BogglePrintModel = PrintHeader & {
  /** The board as a grid of display faces (`boardToDisplay` — 'A', 'Qu', '?', …). */
  board: string[][]
  /** The word list, ALREADY sorted alphabetically (found rows carry score + finder;
   *  a `found: null` row is a missed required word — bare, shown at terminal only). */
  words: WordRow[]
}

const TILE = 26 // fixed board-tile size (= scrabble's rack-tile size)
const TILE_BORDER_W = 0.8 // board-tile border weight

/** Generate the PDF and hand it to the browser as a download. */
export function printBogglePdf(m: BogglePrintModel): void {
  const pd = newPrintDoc()
  drawHeader(pd, m)

  // The shared word-list body (board top-left / Setup right / words below);
  // boggle's only difference is the fixed-tile grid, drawn via the callback.
  drawWordListBody(pd, m, (x, y) => {
    drawBoard(pd.doc, m.board, x, y)
    const size = m.board.length * TILE // square grid: width == height
    return { w: size, h: size }
  })

  savePrint(pd, m, 'boggle')
}

/** Draw the n×n board of fixed-size tiles at (x0, y0) — white, bordered, letter centered. */
function drawBoard(doc: jsPDF, grid: string[][], x0: number, y0: number): void {
  const n = grid.length
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const face = grid[y][x]
      const px = x0 + x * TILE
      const py = y0 + y * TILE
      doc.setLineWidth(TILE_BORDER_W).setDrawColor(DARK_GREY).rect(px, py, TILE, TILE, 'S')
      if (face === '?') {
        // A blank die face — a faint "?" (like a scrabble blank).
        doc.setFont('helvetica', 'bold').setFontSize(TILE * 0.5).setTextColor(DARK_GREY)
        doc.text('?', px + TILE / 2, py + TILE / 2 + TILE * 0.18, { align: 'center' })
      } else {
        // A single letter is big; a multiface ("Qu"/"An") is smaller to fit.
        const fs = face.length > 1 ? TILE * 0.34 : TILE * 0.5
        doc.setFont('helvetica', 'bold').setFontSize(fs).setTextColor(BLACK)
        doc.text(face, px + TILE / 2, py + TILE / 2 + fs * 0.35, { align: 'center' })
      }
    }
  }
}
