import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, fit, newPrintDoc, savePrint } from '../../common/pdf/frame'
import { drawCheck, drawCross, drawDash } from '../../common/pdf/marks'
import { drawTurnLog, twoColGeom } from '../../common/pdf/turnLog'
import type { DuetPrintModel, Mark, PrintCell } from './model'

/**
 * codenamesduet's print-to-PDF — the **turn-log body family** (docs/pdf.md): the
 * 5×5 board in the left column, the clue log beneath.
 *
 * The point of the printout is **thinking about clues away from a screen**, so
 * it always shows the caller's own key — even in the state where the board
 * deliberately hides it (mid-guess, where your own key is a distraction). That's
 * the one place print shows more than the screen, and it's the whole reason the
 * page exists.
 *
 * Three facts share every tile, and none may depend on colour, because a mono
 * printer flattens the palette to one grey:
 *
 *   - **the tile's own border + corner mark** — what HAPPENED here (contacted,
 *     assassinated, burned as a bystander, or untouched).
 *   - **the bottom-left inset** — my key.
 *   - **the top-right inset** — my partner's key, once the game is over.
 *
 * Each mark is ✓ agent / – neutral / ✗ assassin from `common/pdf/marks`, so the
 * shape carries the meaning and the colour is a bonus on a colour printer.
 *
 * Plus the two **bystander triangles**, kept because they're not decoration: a
 * word my PARTNER burned is still mine to guess, while one I burned is locked to
 * me. Planning a clue on paper needs that asymmetry.
 */

/** Print colours for the three meanings. Darker than the screen's fills — these
 *  are strokes on white, and the screen values are tuned as backgrounds. */
const MARK_RGB: Record<Mark, [number, number, number]> = {
  agent: [46, 106, 42], // green
  neutral: [150, 124, 74], // tan
  assassin: [150, 45, 45], // red
}

const COLS = 5
const CELL_GAP = 3
// A keycard inset is deliberately SMALL: it's a reference you consult, sitting
// out of the way of the word. The outcome mark is deliberately BIGGER — it's
// what you scan the grid for.
const INSET = 7 // side of a keycard inset box
const OUTCOME_MARK = 8

/** Generate the PDF and hand it to the browser as a download. */
export function printCodenamesduetPdf(m: DuetPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd
  const { leftX, colW, colTop } = twoColGeom(pd)

  drawHeader(pd, m)

  const cell = (colW - (COLS - 1) * CELL_GAP) / COLS
  const cellH = cell * 0.66
  m.cells.forEach((c, i) => {
    const px = leftX + (i % COLS) * (cell + CELL_GAP)
    const py = colTop + Math.floor(i / COLS) * (cellH + CELL_GAP)
    drawCell(doc, c, px, py, cell, cellH)
  })

  let y = colTop + Math.ceil(m.cells.length / COLS) * (cellH + CELL_GAP) + 6
  y = drawLegend(doc, m, leftX, y, colW) + 12

  drawTurnLog(pd, {
    startY: y,
    // A duet turn IS a clue plus what it got, so the column is "Clue".
    moveLabel: 'Clue',
    // A duet turn has TWO actors — one gives the clue, the other guesses — so a
    // bare "Player" wouldn't say which this column names. It's the clue-giver.
    whoLabel: 'Giver',
    rows: m.turns,
    setup: m.setup,
    mode: m.mode,
    emptyText: 'No clues yet.',
  })

  savePrint(pd, m, 'codenamesduet')
}

/** Draw one mark centred in a `size` box at (cx, cy). */
function mark(doc: jsPDF, kind: Mark, cx: number, cy: number, size: number): void {
  const o = { cx, cy, size, color: MARK_RGB[kind] }
  if (kind === 'agent') drawCheck(o, doc)
  else if (kind === 'assassin') drawCross(o, doc)
  else drawDash(o, doc)
}

/**
 * One board cell: the word, its outcome border + corner mark, the keycard
 * inset(s), and the bystander triangles.
 */
function drawCell(doc: jsPDF, c: PrintCell, x: number, y: number, w: number, h: number): void {
  // The tile's own border says what HAPPENED. An untouched word gets the plain
  // dark-grey box — no outcome, so no colour.
  const outline = c.outcome ? MARK_RGB[c.outcome] : null
  doc.setLineWidth(outline ? 1.6 : 0.6)
  if (outline) doc.setDrawColor(...outline)
  else doc.setDrawColor(DARK_GREY)
  doc.rect(x, y, w, h, 'S')

  // …and its mark repeats it in shape, top-LEFT — the corner the two keycard
  // insets leave free.
  if (c.outcome) mark(doc, c.outcome, x + 8, y + 8, OUTCOME_MARK)

  // The word, centred, shrunk to fit the cell.
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(BLACK)
  const size = Math.min(8, (8 * (w - 16)) / Math.max(doc.getTextWidth(c.word.toUpperCase()), 1))
  doc.setFontSize(size)
  doc.text(fit(doc, c.word.toUpperCase(), w - 8), x + w / 2, y + h / 2 + size * 0.35, {
    align: 'center',
  })

  // My key, bottom-left — the same corner the screen uses.
  drawInset(doc, c.mine, x + 3, y + h - INSET - 3)
  // The partner's, top-right. Only present once the game is over.
  if (c.peer) drawInset(doc, c.peer, x + w - INSET - 3, y + 3)

  // Bystander triangles: mine BELOW the word (pointing down, toward me), my
  // partner's ABOVE (pointing up, toward them) — matching the screen's
  // orientation so the two read the same way.
  if (c.burnedByMe) triangle(doc, x + w / 2, y + h - 5, 4, 'down')
  if (c.burnedByPeer) triangle(doc, x + w / 2, y + 5, 4, 'up')
}

/** A keycard inset: a small bordered box carrying its mark. */
function drawInset(doc: jsPDF, kind: Mark, x: number, y: number): void {
  doc.setLineWidth(1).setDrawColor(...MARK_RGB[kind]).rect(x, y, INSET, INSET, 'S')
  mark(doc, kind, x + INSET / 2, y + INSET / 2, INSET * 0.6)
}

/** A small filled triangle — the "someone burned this" marker. */
function triangle(doc: jsPDF, cx: number, cy: number, s: number, dir: 'up' | 'down'): void {
  const dy = dir === 'up' ? -s : s
  doc.setFillColor(...MARK_RGB.neutral)
  doc.triangle(cx - s * 0.8, cy - dy * 0.4, cx + s * 0.8, cy - dy * 0.4, cx, cy + dy * 0.6, 'F')
}

/**
 * The legend. Not optional: the marks are a private vocabulary, and a printout
 * gets read away from the app where nothing else explains them.
 */
function drawLegend(doc: jsPDF, m: DuetPrintModel, x: number, y: number, colW: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(DARK_GREY)
  doc.text('KEY', x, y + 6)

  const items: [Mark, string][] = [
    ['agent', 'agent'],
    ['neutral', 'bystander'],
    ['assassin', 'assassin'],
  ]
  let cx = x + 26
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(BLACK)
  items.forEach(([kind, label]) => {
    mark(doc, kind, cx + 4, y + 3.5, 6)
    doc.text(label, cx + 11, y + 6)
    cx += 11 + doc.getTextWidth(label) + 14
  })

  // Which corner is whose — the part a reader can't guess.
  doc.setFontSize(7.5).setTextColor(DARK_GREY)
  // Plain ASCII apostrophe, not a curly one: WinAnsi has U+2019, but nothing in
  // printed text gains from risking the encoding — see model.ts on the arrow,
  // which did print as mojibake.
  const corners = m.showsBothKeys
    ? "Bottom-left = your key · top-right = partner's · top-left = what happened"
    : 'Bottom-left = your key · top-left = what happened'
  doc.text(fit(doc, corners, colW), x, y + 17)
  return y + 20
}
