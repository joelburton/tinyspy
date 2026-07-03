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
 * turns list (+ a Setup section) flows down under them, and when it reaches the page
 * bottom it continues from the top of the RIGHT column (newspaper flow), then further pages.
 * jsPDF is imperative — you place every primitive in page points — and a table plugin
 * (jspdf-autotable) only paginates onto new PAGES, not into a second column on the same
 * page, so the moves are hand-drawn here with an explicit column cursor.
 */

/** The print payload — plain data, built by the caller from the live game state, so
 *  this module knows nothing about the game hooks. */
export type ScrabblePrintModel = {
  /** The gametype BRAND ("RackAttack") — never the "scrabble" code-name. */
  brand: string
  /** This game's own title (`common.games.title` — scrabble's first three words). */
  gameTitle: string
  /** Formatted date, shown small at the top-right. */
  date: string
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
  /** Relevant setup options to list at the end (label + value) — e.g. the
   *  dictionary bands. The timer is deliberately excluded (not relevant on a print). */
  setup: { label: string; value: string }[]
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
// Grid line color — darker than a screen board so it reads on a B&W printout.
const GRID = 90
// Turns-table column x-offsets (from the column's left edge). The Move column is the
// important one so it gets the most room; Player is narrow and truncates.
const SEQ_X = 3
const WHO_X = 19
const MOVE_X = 66

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

  // ── Header (spans both columns): "Brand: game title" left, date top-right ──
  // Draw the date first (measure it) so the heading can be truncated to fit left of it.
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(120)
  const dateW = doc.getTextWidth(m.date)
  doc.text(m.date, pageW - margin, margin + 6, { align: 'right' })
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20)
  doc.text(fit(doc, `${m.brand}: ${m.gameTitle}`, pageW - 2 * margin - dateW - 16), margin, margin + 8)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90)
  doc.text(m.summary, margin, margin + 24)

  // ── Left column: board, then rack ───────────────────────
  const cell = colW / BOARD_SIZE
  drawBoard(doc, m.board, leftX, colTop, cell)
  let ly = colTop + cell * BOARD_SIZE + 24

  if (m.rackLabel && m.rack.length) {
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20)
    doc.text(m.rackLabel, leftX, ly)
    ly = drawRack(doc, m.rack, leftX, ly + 6) + 26
  }

  // ── Turns: newspaper flow left → right → further pages ──
  // ("Turns" is this project's word for a play — see the shared TurnLog.)
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(20)
  doc.text('Turns', leftX, ly)
  ly += 6

  const rows: [string, string, string][] = m.moves.length
    ? m.moves.map((mv) => [String(mv.seq), mv.who, mv.text])
    : [['—', '', 'No turns yet.']]
  const rowH = 15
  let col: 0 | 1 = 0 // 0 = left, 1 = right
  let firstPage = true
  const colX = () => (col === 0 ? leftX : rightX)
  const columnTop = () => (firstPage ? colTop : margin)
  const nextColumn = () => {
    if (col === 0) col = 1
    else {
      doc.addPage()
      firstPage = false
      col = 0
    }
  }
  let cy = drawTurnsHeader(doc, leftX, ly, colW)

  rows.forEach((row, i) => {
    if (cy + rowH > pageBottom) {
      nextColumn()
      cy = drawTurnsHeader(doc, colX(), columnTop(), colW)
    }
    const x = colX()
    if (i % 2 === 1) doc.setFillColor(244, 244, 244).rect(x, cy, colW, rowH, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(30)
    doc.text(row[0], x + SEQ_X, cy + 10)
    // Player is narrow + truncates (a cut-off name is still distinguishable); Move
    // gets the rest, because a truncated move wouldn't be.
    doc.text(fit(doc, row[1], MOVE_X - WHO_X - 3), x + WHO_X, cy + 10)
    doc.text(fit(doc, row[2], colW - MOVE_X - 3), x + MOVE_X, cy + 10)
    cy += rowH
  })

  // ── Setup — appended after the turns, same column flow. Kept together: if the
  //    block won't fit in the rest of the column, move it whole to the next column. ──
  if (m.setup.length) {
    const blockH = 12 + 14 + m.setup.length * 13
    if (cy + blockH > pageBottom) {
      nextColumn()
      cy = columnTop()
    } else {
      cy += 12
    }
    const x = colX()
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20)
    doc.text('Setup', x, cy)
    cy += 14
    m.setup.forEach((it) => {
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(40)
      doc.text(`${it.label}: `, x, cy)
      const labelW = doc.getTextWidth(`${it.label}: `)
      doc.setFont('helvetica', 'normal').setTextColor(70)
      doc.text(it.value, x + labelW, cy)
      cy += 13
    })
  }

  doc.save(`${slug(`${m.brand}-${m.gameTitle}`)}.pdf`)
}

/** Draw the 15×15 board at (x0, y0) with the given cell size. */
function drawBoard(doc: jsPDF, board: Cell[], x0: number, y0: number, cell: number): void {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const px = x0 + x * cell
      const py = y0 + y * cell
      const idx = cellIndex(x, y)
      const placed = board[idx]
      doc.setDrawColor(GRID)
      if (placed) {
        doc.setFillColor(...TILE_FILL).rect(px, py, cell, cell, 'FD')
        drawTileGlyph(doc, placed.l, LETTER_VALUES[placed.l] ?? 0, px, py, cell, placed.b)
      } else {
        const prem = premiumAt(x, y)
        // Non-premium squares are WHITE (like the on-screen board) — just the grid
        // line; only premium squares get a fill.
        if (prem === 'none') doc.rect(px, py, cell, cell, 'S')
        else doc.setFillColor(...PREMIUM_STYLE[prem].fill).rect(px, py, cell, cell, 'FD')
        if (idx === CENTER) {
          doc.setFillColor(120, 120, 120).circle(px + cell / 2, py + cell / 2, cell * 0.16, 'F')
        } else if (prem !== 'none') {
          doc.setFont('helvetica', 'bold').setFontSize(cell * 0.34).setTextColor(70)
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
    doc.setFillColor(...TILE_FILL).setDrawColor(GRID)
    doc.rect(px, y0, rt, rt, 'FD')
    if (letter === '?') {
      // An undecided blank — a faint "?" where its letter will go (matches the
      // on-screen rack), and no value.
      doc.setFont('helvetica', 'bold').setFontSize(rt * LETTER_RATIO).setTextColor(150)
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
  const cx = px + size / 2
  const cy = py + size / 2
  doc.setFont('helvetica', 'bold').setFontSize(letterSize).setTextColor(20)
  doc.text(letter, cx, cy + letterSize * 0.35, { align: 'center' })
  if (blank) {
    // Ring the letter (≈1.25em, like the on-screen `.tile.blank`); no score.
    const lw = doc.getLineWidth()
    doc.setLineWidth(letterSize * 0.06).setDrawColor(30).circle(cx, cy, letterSize * 0.62, 'S')
    doc.setLineWidth(lw)
  } else {
    doc.setFont('helvetica', 'normal').setFontSize(size * VALUE_RATIO)
    doc.text(String(value), px + size - size * 0.12, py + size - size * 0.12, { align: 'right' })
  }
}

/** Draw the "# Player Move" column header + a rule at (x, y). Returns the first row's top y. */
function drawTurnsHeader(doc: jsPDF, x: number, y: number, w: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(110)
  doc.text('#', x + SEQ_X, y + 9)
  doc.text('Player', x + WHO_X, y + 9)
  doc.text('Move', x + MOVE_X, y + 9)
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
