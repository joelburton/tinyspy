import { BLACK, DARK_GREY, MEDIUM_GREY, drawSetup, fit, type PrintDoc } from './frame'

/**
 * The newspaper-flow turn log — shared by the turn-based printable games (scrabble,
 * psychicnum). A "Turns" heading, then a `# / Player / <what-happened>` table that
 * fills the LEFT column, continues at the top of the RIGHT column, then onto further
 * pages (PDF libs paginate by page, not column, so the two-column flow is a
 * hand-managed cursor). The game's own board/rack is drawn above `startY` in the left
 * column — hence `twoColGeom`, so the board and the log agree on the column width.
 *
 * The only per-game difference is the third column's header label ("Move" / "Guess").
 */

// Column x-offsets from a column's left edge. The <move> column is the important one,
// so it gets the most room; Player is narrow and truncates (a cut name is still legible).
const SEQ_X = 3
const WHO_X = 19
const MOVE_X = 66
const ROW_H = 15
const RULE_W = 0.4 // the thin between-rows divider (no zebra shading — docs/pdf.md)

/** One turn: its number, who took it, and a one-line description. */
export type TurnRow = { seq: number; who: string; text: string }

/** The two-column newspaper geometry, derived from the page. The board/rack renderer
 *  and the turn log both use `colW` / `colTop` / `leftX` so they line up. */
export function twoColGeom(pd: PrintDoc) {
  const gutter = 22
  const colW = (pd.pageW - 2 * pd.margin - gutter) / 2
  return { gutter, colW, leftX: pd.margin, rightX: pd.margin + colW + gutter, colTop: pd.margin + 44 }
}

/** Draw the "Turns" heading + the turn table (+ the Setup block, kept together at the
 *  end of the flow) starting at `startY` in the left column. */
export function drawTurnLog(
  pd: PrintDoc,
  o: {
    /** Where the "Turns" heading sits (below the board/rack in the left column). */
    startY: number
    /** The third column's header ("Move" for scrabble, "Guess" for psychicnum). */
    moveLabel: string
    rows: TurnRow[]
    setup: { label: string; value: string }[]
    /** Shown as the sole row when there are no turns yet. */
    emptyText?: string
  },
): void {
  const { doc, pageBottom } = pd
  const { leftX, rightX, colW, colTop } = twoColGeom(pd)

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(BLACK)
  doc.text('Turns', leftX, o.startY)
  const ly = o.startY + 6

  // Normalize to display rows (seq as text); an empty log shows one placeholder row.
  const rows: { seq: string; who: string; text: string }[] = o.rows.length
    ? o.rows.map((r) => ({ seq: String(r.seq), who: r.who, text: r.text }))
    : [{ seq: '—', who: '', text: o.emptyText ?? 'No turns yet.' }]

  let col: 0 | 1 = 0 // 0 = left, 1 = right
  let firstPage = true
  const colX = () => (col === 0 ? leftX : rightX)
  const columnTop = () => (firstPage ? colTop : pd.margin)
  const nextColumn = () => {
    if (col === 0) col = 1
    else {
      doc.addPage()
      firstPage = false
      col = 0
    }
  }
  let cy = drawTurnsHeader(pd, leftX, ly, colW, o.moveLabel)
  let firstInColumn = true

  rows.forEach((row) => {
    if (cy + ROW_H > pageBottom) {
      nextColumn()
      cy = drawTurnsHeader(pd, colX(), columnTop(), colW, o.moveLabel)
      firstInColumn = true
    }
    const x = colX()
    if (!firstInColumn) doc.setDrawColor(MEDIUM_GREY).setLineWidth(RULE_W).line(x, cy, x + colW, cy)
    firstInColumn = false
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
    doc.text(row.seq, x + SEQ_X, cy + 10)
    doc.text(fit(doc, row.who, MOVE_X - WHO_X - 3), x + WHO_X, cy + 10)
    doc.text(fit(doc, row.text, colW - MOVE_X - 3), x + MOVE_X, cy + 10)
    cy += ROW_H
  })

  // Setup — appended after the turns in the same flow. Kept together: if the block
  // won't fit in the rest of the column, move it whole to the next column.
  if (o.setup.length) {
    const blockH = 22 + 13 + o.setup.length * 13
    if (cy + blockH > pageBottom) {
      nextColumn()
      cy = columnTop()
    } else {
      cy += 22 // space before the Setup section
    }
    drawSetup(doc, o.setup, colX(), cy)
  }
}

/** Draw the "# Player <move>" column header + a rule at (x, y). Returns the first row's top y. */
function drawTurnsHeader(pd: PrintDoc, x: number, y: number, w: number, moveLabel: string): number {
  const { doc } = pd
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(DARK_GREY)
  doc.text('#', x + SEQ_X, y + 9)
  doc.text('Player', x + WHO_X, y + 9)
  doc.text(moveLabel, x + MOVE_X, y + 9)
  doc.setDrawColor(MEDIUM_GREY).setLineWidth(0.5).line(x, y + 13, x + w, y + 13)
  return y + 16
}
