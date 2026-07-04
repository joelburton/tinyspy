import { jsPDF } from 'jspdf'
import {
  BOARD_SIZE,
  CENTER,
  cellIndex,
  LETTER_VALUES,
  premiumAt,
  type Cell,
  type PremiumType,
} from '../lib/board'
import { BLACK, DARK_GREY, drawHeader, newPrintDoc, savePrint, type PrintHeader } from '../../common/pdf/frame'
import { drawTurnLog, twoColGeom, type TurnRow } from '../../common/pdf/turnLog'

/**
 * scrabble's print-to-PDF, composed from the shared `common/pdf` helpers (docs/pdf.md):
 * the frame (header / save) + `turnLog` (the newspaper 2-column move flow). All that's
 * scrabble-specific is the board + rack. It reuses the pure board logic (premiumAt /
 * LETTER_VALUES / …) but draws its own print-tuned board rather than the on-screen
 * `<Board>` (CSS-modules + pointer handlers, print-hostile).
 *
 * The board + rack sit at the top of the LEFT column; the moves flow down under them
 * (via `turnLog`) and continue in the RIGHT column, then onto further pages.
 */

/** The print payload — plain data, built by the caller from the live game state, so
 *  this module knows nothing about the game hooks. */
export type ScrabblePrintModel = PrintHeader & {
  /** The 225-cell board (same array the FE renders). */
  board: Cell[]
  /** One row per play, already formatted (# / who / what). */
  moves: TurnRow[]
  /** The tiles to show ('?' = a blank). */
  rack: string[]
  /** "Your rack" (compete) / "Team rack" (coop) / "" (a watcher — omit). */
  rackLabel: string
}

/** Premium square → its label + print fill (RGB). Light pastel tones — the meaningful
 *  board-color exception in docs/pdf.md, kept faint so the ink reads clean. */
const PREMIUM_STYLE: Record<PremiumType, { label: string; fill: [number, number, number] }> = {
  TW: { label: 'TW', fill: [240, 188, 180] }, // triple word — light red
  DW: { label: 'DW', fill: [249, 219, 216] }, // double word — light pink
  TL: { label: 'TL', fill: [188, 213, 235] }, // triple letter — light blue
  DL: { label: 'DL', fill: [221, 236, 244] }, // double letter — lighter blue
  none: { label: '', fill: [243, 239, 230] }, // plain (unused — 'none' cells stay white)
}

// The placed-tile fill = common theme's `--tile-1` (#faf7ef), the lightest resting tile.
const TILE_FILL: [number, number, number] = [250, 247, 239]
// Tile glyph proportions matched to the on-screen board (Board.module.css:
// .letter = 58cqmin, .value = 36cqmin), so the value reads small next to the letter.
const LETTER_RATIO = 0.58
const VALUE_RATIO = 0.36
// Board line weights. (scrabble's premium-square + tile fills are the agreed
// board-color exception in docs/pdf.md — they carry board meaning, not decoration.)
const BORDER_W = 0.6 // empty-cell grid weight (a "normal" line — matches psychicnum's board)
const TILE_BORDER_W = 1 // placed tiles get a thicker frame so they stand out from empty cells

/** Generate the PDF and hand it to the browser as a download. */
export function printScrabblePdf(m: ScrabblePrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd
  const { leftX, colW, colTop } = twoColGeom(pd)

  drawHeader(pd, m)

  // ── Left column: board, then rack ───────────────────────
  const cell = colW / BOARD_SIZE
  drawBoard(doc, m.board, leftX, colTop, cell)
  let ly = colTop + cell * BOARD_SIZE + 24

  if (m.rackLabel && m.rack.length) {
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(BLACK)
    doc.text(m.rackLabel, leftX, ly)
    ly = drawRack(doc, m.rack, leftX, ly + 6) + 26
  }

  // ── Moves: the shared newspaper turn flow (labelled "Move") ──
  drawTurnLog(pd, { startY: ly, moveLabel: 'Move', rows: m.moves, setup: m.setup })

  savePrint(pd, m, 'scrabble')
}

/** Draw the 15×15 board at (x0, y0) with the given cell size. */
function drawBoard(doc: jsPDF, board: Cell[], x0: number, y0: number, cell: number): void {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const px = x0 + x * cell
      const py = y0 + y * cell
      const idx = cellIndex(x, y)
      const placed = board[idx]
      // Border weight is set per cell (a mark can bump the line width). A placed tile
      // gets a thicker frame (TILE_BORDER_W) so it stands out from the empty cells.
      doc.setDrawColor(DARK_GREY)
      if (placed) {
        doc.setLineWidth(TILE_BORDER_W).setFillColor(...TILE_FILL).rect(px, py, cell, cell, 'FD')
        drawTileGlyph(doc, placed.l, LETTER_VALUES[placed.l] ?? 0, px, py, cell, placed.b)
      } else {
        doc.setLineWidth(BORDER_W)
        const prem = premiumAt(x, y)
        // Non-premium squares are WHITE (like the on-screen board) — just the grid
        // line; only premium squares get a fill.
        if (prem === 'none') doc.rect(px, py, cell, cell, 'S')
        else doc.setFillColor(...PREMIUM_STYLE[prem].fill).rect(px, py, cell, cell, 'FD')
        if (idx === CENTER) {
          doc.setFillColor(DARK_GREY, DARK_GREY, DARK_GREY).circle(px + cell / 2, py + cell / 2, cell * 0.16, 'F')
        } else if (prem !== 'none') {
          doc.setFont('helvetica', 'bold').setFontSize(cell * 0.34).setTextColor(BLACK)
          doc.text(PREMIUM_STYLE[prem].label, px + cell / 2, py + cell / 2 + cell * 0.12, { align: 'center' })
        }
      }
    }
  }
}

/** Draw the rack tiles left-to-right from (x0, y0). Returns the bottom y. */
function drawRack(doc: jsPDF, rack: string[], x0: number, y0: number): number {
  const rt = 26
  const gap = 6
  rack.forEach((letter, i) => {
    const px = x0 + i * (rt + gap)
    doc.setFillColor(...TILE_FILL).setLineWidth(TILE_BORDER_W).setDrawColor(DARK_GREY)
    doc.rect(px, y0, rt, rt, 'FD')
    if (letter === '?') {
      // An undecided blank — a faint "?" where its letter will go (matches the
      // on-screen rack), and no value.
      doc.setFont('helvetica', 'bold').setFontSize(rt * LETTER_RATIO).setTextColor(DARK_GREY)
      doc.text('?', px + rt / 2, y0 + rt / 2 + rt * LETTER_RATIO * 0.35, { align: 'center' })
    } else {
      drawTileGlyph(doc, letter, LETTER_VALUES[letter] ?? 0, px, y0, rt)
    }
  })
  return y0 + rt
}

/** A scrabble tile glyph: the centered letter + a small bottom-right value, sized in
 *  the same 58/36 proportion as the on-screen board tile. A **decided blank** (`blank`)
 *  shows no value and rings its letter — the same signal the on-screen board uses (a
 *  blank scored 0, so the letter is "borrowed"). */
function drawTileGlyph(
  doc: jsPDF,
  letter: string,
  value: number,
  px: number,
  py: number,
  size: number,
  blank = false,
): void {
  const letterSize = size * LETTER_RATIO
  // Shift the letter a touch left + up (so it clears the bottom-right score; the
  // blank-ring is centered on (cx, cy) too, so it follows the letter).
  const cx = px + size * 0.47
  const cy = py + size * 0.44
  doc.setFont('helvetica', 'bold').setFontSize(letterSize).setTextColor(BLACK)
  doc.text(letter, cx, cy + letterSize * 0.35, { align: 'center' })
  if (blank) {
    // Ring the letter (≈1.25em, like the on-screen `.tile.blank`); no score.
    const lw = doc.getLineWidth()
    doc.setLineWidth(letterSize * 0.06).setDrawColor(BLACK).circle(cx, cy, letterSize * 0.62, 'S')
    doc.setLineWidth(lw)
  } else {
    doc.setFont('helvetica', 'normal').setFontSize(size * VALUE_RATIO)
    doc.text(String(value), px + size - size * 0.12, py + size - size * 0.12, { align: 'right' })
  }
}
