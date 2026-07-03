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

/**
 * ⚠️ SPIKE / POC (branch `scrabble-jspdf`). A throwaway proof-of-concept to see what
 * the jsPDF code shape looks like for printing a scrabble board — to compare against
 * a react-pdf spike before we pick a direction and build the real, shared-across-games
 * version. Self-contained + un-abstracted on purpose: no common/ scaffold, no font
 * embedding. Reuses the pure board logic (premiumAt / LETTER_VALUES / …) but draws its
 * own print-tuned board rather than the on-screen `<Board>` (CSS-modules + pointer
 * handlers, print-hostile).
 *
 * **Layout: two columns.** The board + rack sit at the top of the LEFT column, the
 * moves list flows down under them, and when it reaches the page bottom it continues
 * from the top of the RIGHT column (a newspaper-style flow), then onto further pages.
 * jsPDF is imperative — you place every primitive in page points — and a table plugin
 * (jspdf-autotable) only paginates onto new PAGES, not into a second column on the same
 * page, so the moves are hand-drawn here with an explicit column cursor.
 */

/** The print payload — plain data, built by the caller from the live game state, so
 *  this module knows nothing about the game hooks. */
export type ScrabblePrintModel = {
  title: string
  /** e.g. "Team score: 42 · 12 tiles in the bag". */
  summary: string
  /** The 225-cell board (same array the FE renders). */
  board: Cell[]
  /** One row per play, already formatted (# / who / what). */
  moves: { seq: number; who: string; text: string }[]
  /** The tiles to show ('?' = a blank). */
  rack: string[]
  /** "Your rack" (compete) / "Team rack" (coop) / "" (a watcher — omit). */
  rackLabel: string
}

/** Premium square → its label + print fill (RGB). Muted, ink-friendly tones. */
const PREMIUM_STYLE: Record<PremiumType, { label: string; fill: [number, number, number] }> = {
  TW: { label: 'TW', fill: [225, 120, 105] }, // triple word — red
  DW: { label: 'DW', fill: [242, 183, 176] }, // double word — pink
  TL: { label: 'TL', fill: [120, 170, 214] }, // triple letter — dark blue
  DL: { label: 'DL', fill: [186, 216, 233] }, // double letter — light blue
  none: { label: '', fill: [243, 239, 230] }, // plain — cream
}

const TILE_FILL: [number, number, number] = [227, 203, 152] // placed-tile tan
// Tile glyph proportions matched to the on-screen board (Board.module.css:
// .letter = 58cqmin, .value = 36cqmin), so the value reads small next to the letter.
const LETTER_RATIO = 0.58
const VALUE_RATIO = 0.36

/** Generate the PDF and hand it to the browser as a download. */
export function printScrabblePdf(m: ScrabblePrintModel): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const gutter = 22
  const colW = (pageW - 2 * margin - gutter) / 2
  const leftX = margin
  const rightX = margin + colW + gutter
  const colTop = margin + 44
  const pageBottom = pageH - margin

  // ── Header (spans both columns) ─────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20)
  doc.text(m.title, margin, margin + 4)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90)
  doc.text(m.summary, margin, margin + 22)

  // ── Left column: board, then rack ───────────────────────
  const cell = colW / BOARD_SIZE
  drawBoard(doc, m.board, leftX, colTop, cell)
  let ly = colTop + cell * BOARD_SIZE + 24

  if (m.rackLabel && m.rack.length) {
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20)
    doc.text(m.rackLabel, leftX, ly)
    ly = drawRack(doc, m.rack, leftX, ly + 6) + 26
  }

  // ── Moves: newspaper flow left → right → further pages ──
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(20)
  doc.text('Moves', leftX, ly)
  ly += 6

  const rows: [string, string, string][] = m.moves.length
    ? m.moves.map((mv) => [String(mv.seq), mv.who, mv.text])
    : [['—', '', 'No moves yet.']]
  const rowH = 15
  let col: 0 | 1 = 0 // 0 = left, 1 = right
  let firstPage = true
  const columnTop = () => (firstPage ? colTop : margin)
  let cy = drawMovesHeader(doc, leftX, ly, colW)

  rows.forEach((row, i) => {
    if (cy + rowH > pageBottom) {
      if (col === 0) {
        col = 1
        cy = drawMovesHeader(doc, rightX, columnTop(), colW)
      } else {
        doc.addPage()
        firstPage = false
        col = 0
        cy = drawMovesHeader(doc, leftX, columnTop(), colW)
      }
    }
    const x = col === 0 ? leftX : rightX
    if (i % 2 === 1) {
      doc.setFillColor(244, 244, 244).rect(x, cy, colW, rowH, 'F')
    }
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(30)
    doc.text(row[0], x + 3, cy + 10)
    doc.text(fit(doc, row[1], 84), x + 22, cy + 10)
    doc.text(fit(doc, row[2], colW - 112), x + 110, cy + 10)
    cy += rowH
  })

  doc.save(`${slug(m.title)}.pdf`)
}

/** Draw the 15×15 board at (x0, y0) with the given cell size. */
function drawBoard(doc: jsPDF, board: Cell[], x0: number, y0: number, cell: number): void {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const px = x0 + x * cell
      const py = y0 + y * cell
      const idx = cellIndex(x, y)
      const placed = board[idx]
      if (placed) {
        doc.setFillColor(...TILE_FILL).setDrawColor(140)
        doc.rect(px, py, cell, cell, 'FD')
        drawTileGlyph(doc, placed.l, placed.b ? 0 : (LETTER_VALUES[placed.l] ?? 0), px, py, cell)
      } else {
        const st = PREMIUM_STYLE[premiumAt(x, y)]
        doc.setFillColor(...st.fill).setDrawColor(205)
        doc.rect(px, py, cell, cell, 'FD')
        if (idx === CENTER) {
          doc.setFillColor(150, 150, 150).circle(px + cell / 2, py + cell / 2, cell * 0.16, 'F')
        } else if (st.label) {
          doc.setFont('helvetica', 'bold').setFontSize(cell * 0.34).setTextColor(70)
          doc.text(st.label, px + cell / 2, py + cell / 2 + cell * 0.12, { align: 'center' })
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
    doc.setFillColor(...TILE_FILL).setDrawColor(140)
    doc.rect(px, y0, rt, rt, 'FD')
    if (letter !== '?') drawTileGlyph(doc, letter, LETTER_VALUES[letter] ?? 0, px, y0, rt)
  })
  return y0 + rt
}

/** A scrabble tile glyph: the centered letter + a small bottom-right value, sized in
 *  the same 58/36 proportion as the on-screen board tile. */
function drawTileGlyph(doc: jsPDF, letter: string, value: number, px: number, py: number, size: number): void {
  const letterSize = size * LETTER_RATIO
  doc.setFont('helvetica', 'bold').setFontSize(letterSize).setTextColor(20)
  doc.text(letter, px + size / 2, py + size / 2 + letterSize * 0.35, { align: 'center' })
  doc.setFont('helvetica', 'normal').setFontSize(size * VALUE_RATIO)
  doc.text(String(value), px + size - size * 0.12, py + size - size * 0.12, { align: 'right' })
}

/** Draw the "# Player Move" column header + a rule at (x, y). Returns the first row's top y. */
function drawMovesHeader(doc: jsPDF, x: number, y: number, w: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(110)
  doc.text('#', x + 3, y + 9)
  doc.text('Player', x + 22, y + 9)
  doc.text('Move', x + 110, y + 9)
  doc.setDrawColor(180).line(x, y + 13, x + w, y + 13)
  return y + 16
}

/** Truncate `text` with an ellipsis to fit `maxW` at the current font size. */
function fit(doc: jsPDF, text: string, maxW: number): string {
  if (!text || doc.getTextWidth(text) <= maxW) return text
  let t = text
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}

/** A filesystem-safe filename from the title. */
function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'scrabble'
}
