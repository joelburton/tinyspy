// cs-audited-pdf

import { BLACK, fit, type PrintDoc } from './frame'

const ROW_H = 11
const COL_GUTTER = 12 // gap between columns, so a finder never touches the next column's word

/** One word-list entry: `word (· bonus dot) … +score  finder`. */
export type WordRow = {
  word: string
  // A found word's score and finder; `null` draws the bare word alone — the
  // "nobody found this" signal, and what a player's own section uses.
  found: { points: number; who: string } | null
  // A trailing filled dot — a bonus-band find.
  bonus?: boolean
  // The word in bold — a pangram.
  pangram?: boolean
}

/**
 * Draw a word list: the heading (`heading`, or "Words") at (margin, startY),
 * an optional `subheading` tally line ("12 words · 34 pts") under it, then the
 * rows in `cols` column-major, balanced columns — ⌈n / cols⌉ rows each, so the
 * words form a compact block rather than one tall column — capped and spilled
 * onto further pages only when even the balanced height overflows. An empty
 * list prints "No words yet." Returns the y below the block, so a caller
 * stacking several lists knows where the next one starts.
 */
export function drawWordColumns(
  pd: PrintDoc,
  o: {
    startY: number
    cols: number
    rows: WordRow[]
    heading?: string
    subheading?: string
  },
): number {
  const { doc, pageW, margin, pageBottom } = pd
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(BLACK)
  doc.text(o.heading ?? 'Words', margin, o.startY)

  let headBottom = o.startY
  if (o.subheading) {
    headBottom += 12
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
    doc.text(o.subheading, margin, headBottom)
  }

  const colW = (pageW - 2 * margin) / o.cols
  let remaining = o.rows
  let top = headBottom + 12
  let bottom = top
  if (!remaining.length) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
    doc.text('No words yet.', margin, top + 4)
    bottom = top + 8
  }
  while (remaining.length) {
    // Balance across ALL columns (⌈n / cols⌉ rows), capped by what fits on the page.
    const fitRows = Math.max(1, Math.floor((pageBottom - top) / ROW_H))
    const rowsPerCol = Math.min(fitRows, Math.ceil(remaining.length / o.cols))
    const perPage = o.cols * rowsPerCol
    remaining.slice(0, perPage).forEach((w, i) => {
      const c = Math.floor(i / rowsPerCol)
      const r = i % rowsPerCol
      drawWordRow(pd, w, margin + c * colW, top + r * ROW_H, colW)
    })
    remaining = remaining.slice(perPage)
    bottom = top + rowsPerCol * ROW_H
    if (remaining.length) {
      doc.addPage()
      top = margin
      bottom = top
    }
  }
  return bottom
}

/** One cell: word (+ bonus dot) left, and — for a FOUND word — +score and finder
 *  right-justified. A missed word (`found: null`) is the bare word alone. */
function drawWordRow(pd: PrintDoc, w: WordRow, x: number, ry: number, colW: number): void {
  const { doc } = pd
  const right = x + colW - COL_GUTTER
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(BLACK)
  // The word may run to the column's right edge — unless a found word's score + finder
  // claim the right side, which shrinks the space left for it.
  let wordMaxW = right - x - (w.bonus ? 6 : 0)
  if (w.found) {
    const who = fit(doc, w.found.who, colW * 0.42)
    doc.text(who, right, ry, { align: 'right' })
    const scoreStr = `+${w.found.points}`
    const scoreRight = right - doc.getTextWidth(who) - 5
    doc.text(scoreStr, scoreRight, ry, { align: 'right' })
    wordMaxW = scoreRight - doc.getTextWidth(scoreStr) - 6 - (w.bonus ? 6 : 0) - x
  }
  // A pangram is bold — set the weight BEFORE measuring, so the fit + dot use it.
  doc.setFont('helvetica', w.pangram ? 'bold' : 'normal')
  const word = fit(doc, w.word, Math.max(6, wordMaxW))
  doc.text(word, x, ry)
  if (w.bonus) {
    doc.setFillColor(BLACK, BLACK, BLACK).circle(x + doc.getTextWidth(word) + 3, ry - 2.2, 1.3, 'F')
  }
}
