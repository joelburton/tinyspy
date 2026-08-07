import { jsPDF } from 'jspdf'
import {
  BLACK,
  DARK_GREY,
  drawHeader,
  drawSetup,
  fit,
  newPrintDoc,
  savePrint,
} from '../../common/pdf/frame'
import { drawInTracks, type Track } from '../../common/pdf/columns'
import { drawTurnLog, twoColGeom } from '../../common/pdf/turnLog'
import { drawCheck, drawCross } from '../../common/pdf/marks'
import type { PrintTile, PrintTrack, PsychicnumPrintModel } from './model'

/**
 * psychicnum's print-to-PDF, composed from the shared `common/pdf` helpers
 * (docs/pdf.md). The model (see ./model.ts) decides whose guesses belong
 * where; this file only draws.
 *
 * Two layouts, one per mode:
 *   - **coop** — the classic turn-log family page: the shared board on the
 *     left, the newspaper guess flow beside it. One board, because the team
 *     shares one.
 *   - **compete** — one **track per player** (`common/pdf/columns.ts`, up to
 *     three per page): their own copy of the board with their own ✓/✗ marks,
 *     their own score line, their own guess log. A single merged board is a
 *     lie in compete — every player races their own — and that's what this
 *     printer used to produce at terminal.
 *
 * **Success/fail must survive B&W.** psychicnum's tiles carry meaning only in
 * color (green = a secret found, red = a miss). Printed in black-and-white both
 * go grey, so every guessed tile also gets a drawn **shape mark** — a ✓ for a
 * found secret, a ✗ for a miss (Helvetica has no ✓/✗ glyphs, so they're drawn
 * from line segments). The shape distinguishes them without color; the fill is
 * a bonus on a color printer.
 */

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

  drawHeader(pd, m)

  if (m.mode === 'coop') {
    // ── Coop: shared board (left column) + the newspaper guess flow ──
    const { leftX, colW, colTop } = twoColGeom(pd)
    const t = m.tracks[0]
    const boardH = drawBoard(doc, t.board, m.cols, leftX, colTop, colW)
    drawTurnLog(pd, {
      startY: colTop + boardH + 26,
      moveLabel: 'Guess',
      rows: t.turns,
      setup: m.setup,
      mode: m.mode,
    })
  } else {
    // ── Compete: one track per player — board, score, own log ──
    const { bottom, left } = drawInTracks(pd, m.tracks, (t, track) =>
      drawTrack(doc, t, track, m.cols),
    )
    if (m.setup.length) drawSetup(doc, m.setup, left, bottom + 18, m.mode)
  }

  savePrint(pd, m, 'psychicnum')
}

/** One player's column: name, their board, their score line, their guesses. */
function drawTrack(doc: jsPDF, t: PrintTrack, track: Track, cols: number): number {
  // Who this column belongs to.
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text(fit(doc, t.who, track.width), track.x, track.top)

  let y = track.top + 8
  y += drawBoard(doc, t.board, cols, track.x, y, track.width)

  y += 12
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
  doc.text(fit(doc, t.result, track.width), track.x, y)
  y += 14

  return drawGuessList(doc, t, track, y)
}

/**
 * Draw the word-tile grid at (x0, y0), sized to `width`. Every tile is a
 * bordered white square (no fill); a decided tile carries only a top-corner
 * ✓ (found) / ✗ (miss) mark. Returns the grid's height.
 */
function drawBoard(
  doc: jsPDF,
  board: PrintTile[],
  cols: number,
  x0: number,
  y0: number,
  width: number,
): number {
  const cellW = width / cols
  const cellH = cellW * 0.62
  const lw0 = doc.getLineWidth()
  // ONE uniform word size for every tile — the largest that fits a 10-letter word in
  // the tile (capped for height). No per-tile shrinking, so the board reads evenly.
  doc.setFont('helvetica', 'bold').setFontSize(10)
  const size = Math.min(cellH * 0.42, (10 * (cellW - 10)) / doc.getTextWidth('WATERMELON'))
  doc.setFontSize(size).setTextColor(BLACK)
  board.forEach((tile, i) => {
    const px = x0 + (i % cols) * cellW
    const py = y0 + Math.floor(i / cols) * cellH
    // Set the border weight on EVERY rect — the marks bump the line width, so a
    // stale value would otherwise thicken every cell after the first marked one.
    doc.setLineWidth(BORDER_W).setDrawColor(DARK_GREY).rect(px, py, cellW, cellH, 'S')
    // Word a hair below center so it clears the top-corner mark.
    doc.text(tile.word, px + cellW / 2, py + cellH / 2 + size * 0.35 + 2, { align: 'center' })
    // Top-right corner of the cell — psychicnum's own placement; the shared
    // marks take a centre, so the corner math lives here now.
    const markSize = Math.min(cellW, cellH) * 0.22
    const mark = { cx: px + cellW - markSize, cy: py + markSize, size: markSize }
    if (tile.state === 'correct') drawCheck({ ...mark, color: MARK_CORRECT }, doc)
    else if (tile.state === 'miss') drawCross({ ...mark, color: MARK_MISS }, doc)
  })
  doc.setLineWidth(lw0)
  return Math.ceil(board.length / cols) * cellH
}

/** A track's own guess list — the same compact shape wordle's tracks use.
 *  psychicnum's budget is seven guesses, so a track's list never paginates. */
function drawGuessList(doc: jsPDF, t: PrintTrack, track: Track, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
  doc.text('Guesses', track.x, y)
  let cy = y + 12
  if (!t.turns.length) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(DARK_GREY)
    doc.text('None yet.', track.x, cy)
    return cy
  }
  t.turns.forEach((turn) => {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(DARK_GREY)
    doc.text(String(turn.seq), track.x, cy)
    doc.setTextColor(BLACK)
    doc.text(fit(doc, turn.text, track.width - 14), track.x + 12, cy)
    cy += 11
  })
  return cy
}
