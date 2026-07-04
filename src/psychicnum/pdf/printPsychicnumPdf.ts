import { jsPDF } from 'jspdf'

/**
 * ⚠️ SPIKE (branch: psychicnum is our try-new-features game). A print-to-PDF for
 * psychicnum, modelled on scrabble's `printScrabblePdf` (the chosen jsPDF approach):
 * a 2-column Letter page — the word board + summary at the top of the LEFT column,
 * the guess log flowing under it and continuing at the top of the RIGHT column.
 *
 * **Success/fail must survive B&W.** psychicnum's tiles carry meaning only in color
 * (green = a secret found, red = a miss). Printed in black-and-white both go grey, so
 * every guessed tile also gets a drawn **shape mark** — a ✓ for a found secret, a ✗
 * for a miss (Helvetica has no ✓/✗ glyphs, so they're drawn from line segments). The
 * shape distinguishes them without color; the fill is a bonus on a color printer.
 *
 * NOTE: this duplicates scrabble's header / newspaper-column-flow / `fit` / `slug`
 * (a `<game>/` can't import another `<game>/`). Now that TWO games print, those shared
 * parts are the seam to extract into a `common/` print scaffold — the next step.
 */

/** The print payload — plain data, built by the caller from the live game state. */
export type PsychicnumPrintModel = {
  brand: string
  gameTitle: string
  date: string
  summary: string
  /** Board tiles in row-major order (uppercased words). */
  board: { word: string; state: 'correct' | 'miss' | 'undecided' }[]
  /** Grid columns (rows derive from `board.length`). */
  cols: number
  /** One row per guess/hint/reveal, already formatted. */
  turns: { seq: number; who: string; text: string }[]
  /** Relevant setup options (label + value) — e.g. the difficulty band. Timer
   *  excluded (not relevant on a print). A general print feature — see scrabble. */
  setup: { label: string; value: string }[]
}

// ── The print shade system (see docs/pdf.md). Everything not EXPLICITLY colored (the
//    ✓/✗ marks) is one of these three greys — clean + readable in B&W. Scale is
//    0 = black … 255 = white (jsPDF's single-arg grey). ──
const BLACK = 0 // all text / data / headings
const DARK_GREY = 70 // real-but-secondary marks — the board grid + column-header labels
const MEDIUM_GREY = 180 // minor lines only — turnlog dividers + the table header rule
// Line weights: a "normal" cell border, and thinner divider rules. The cell-border
// weight is set on EVERY rect so a mark's thicker stroke can't leak into the next cell.
const BORDER_W = 0.6
const RULE_W = 0.4
// Turns-table column x-offsets (same as scrabble's): the Guess column is widest.
const SEQ_X = 3
const WHO_X = 19
const GUESS_X = 66
// The ✓ / ✗ marks — green / red on a color printer, distinguished by SHAPE in B&W.
// Decided tiles carry no fill; the mark alone signals correct vs miss.
const MARK_CORRECT: [number, number, number] = [46, 106, 42]
const MARK_MISS: [number, number, number] = [150, 45, 45]

/** Generate the PDF and hand it to the browser as a download. */
export function printPsychicnumPdf(m: PsychicnumPrintModel): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 28 // tight-ish so the columns use more of the paper (safe for print)
  const gutter = 22
  const colW = (pageW - 2 * margin - gutter) / 2
  const leftX = margin
  const rightX = margin + colW + gutter
  const colTop = margin + 44
  const pageBottom = pageH - margin

  // ── Header: "Brand: game title" left, date top-right, summary below ──
  // Data is black (the date is small, not grey — small ≠ unimportant); only genuine
  // chrome (column labels, rules) is muted.
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
  const dateW = doc.getTextWidth(m.date)
  doc.text(m.date, pageW - margin, margin + 6, { align: 'right' })
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(BLACK)
  doc.text(fit(doc, `${m.brand}: ${m.gameTitle}`, pageW - 2 * margin - dateW - 16), margin, margin + 8)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(BLACK)
  doc.text(m.summary, margin, margin + 24)

  // ── Board (left column): the word-tile grid ──
  const rows = Math.ceil(m.board.length / m.cols)
  const cellW = colW / m.cols
  const cellH = cellW * 0.62
  drawBoard(doc, m, leftX, colTop, cellW, cellH)
  let ly = colTop + rows * cellH + 26

  // ── Turns (turn log): newspaper flow left → right → further pages ──
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(BLACK)
  doc.text('Turns', leftX, ly)
  ly += 6

  const list = m.turns.length ? m.turns : [{ seq: 0, who: '', text: 'No turns yet.' }]
  const rowH = 15
  let col: 0 | 1 = 0
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
  let firstInColumn = true

  list.forEach((t) => {
    if (cy + rowH > pageBottom) {
      nextColumn()
      cy = drawTurnsHeader(doc, colX(), columnTop(), colW)
      firstInColumn = true
    }
    const x = colX()
    // A thin rule between turns (replaces the alternate-row shading).
    if (!firstInColumn) doc.setDrawColor(MEDIUM_GREY).setLineWidth(RULE_W).line(x, cy, x + colW, cy)
    firstInColumn = false
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
    doc.text(t.seq ? String(t.seq) : '—', x + SEQ_X, cy + 10)
    doc.text(fit(doc, t.who, GUESS_X - WHO_X - 3), x + WHO_X, cy + 10)
    doc.text(fit(doc, t.text, colW - GUESS_X - 3), x + GUESS_X, cy + 10)
    cy += rowH
  })

  // ── Setup — appended after the log, same column flow (kept together). ──
  if (m.setup.length) {
    const blockH = 22 + 13 + m.setup.length * 13
    if (cy + blockH > pageBottom) {
      nextColumn()
      cy = columnTop()
    } else {
      cy += 22 // space before the Setup section
    }
    const x = colX()
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK) // smaller sub-heading
    doc.text('Setup', x, cy)
    cy += 13
    m.setup.forEach((it) => {
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
      doc.text(`${it.label}: `, x, cy)
      const labelW = doc.getTextWidth(`${it.label}: `)
      doc.setFont('helvetica', 'normal').setTextColor(BLACK)
      doc.text(it.value, x + labelW, cy)
      cy += 13
    })
  }

  doc.save(`${slug(`${m.brand}-${m.gameTitle}`)}.pdf`)
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
    // The board grid is real content → DARK_GREY (MEDIUM_GREY is only for the minor
    // turnlog dividers).
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

/** Draw the "# Player Guess" column header + a rule at (x, y). Returns the first row's top y. */
function drawTurnsHeader(doc: jsPDF, x: number, y: number, w: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(DARK_GREY)
  doc.text('#', x + SEQ_X, y + 9)
  doc.text('Player', x + WHO_X, y + 9)
  doc.text('Guess', x + GUESS_X, y + 9)
  doc.setDrawColor(MEDIUM_GREY).setLineWidth(0.5).line(x, y + 13, x + w, y + 13)
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
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'psychicnum'
}
