import { BLACK, fit, type PrintDoc } from './frame'

/**
 * The multi-column word list — shared by the word-hunt printable games (boggle, and
 * spellingbee next). A "Words" heading, then the words in N column-major, alphabetical
 * columns, each row `word (·bonus dot) … +score  finder`. The words are BALANCED
 * across the columns (⌈n / cols⌉ rows) so they form a compact block rather than one
 * tall column; only when even the balanced height overflows the page do we cap + spill.
 *
 * Per-game emphasis rides on the row flags, so each game opts in without a fork:
 *   - `bonus`   → a filled dot after the word (boggle's bonus-band words)
 *   - `pangram` → the word in bold (spellingbee's pangrams)
 * A `found: null` row is a word shown WITHOUT a score/finder (boggle's terminal reveal
 * of required-but-missed words) — the bare word is the "unfound" signal.
 */

const ROW_H = 11
const COL_GUTTER = 12 // gap between columns, so a finder never touches the next column's word

/** One word-list entry. */
export type WordRow = {
  word: string
  /** A found word's score + finder; `null` = shown as the bare word (no score/finder). */
  found: { points: number; who: string } | null
  /** boggle: mark the word with a trailing dot (a bonus-band find). */
  bonus?: boolean
  /** spellingbee: render the word in bold (a pangram). */
  pangram?: boolean
}

/** Draw the "Words" heading at (margin, startY) + the balanced N-column word list below. */
export function drawWordColumns(
  pd: PrintDoc,
  o: { startY: number; cols: number; rows: WordRow[]; heading?: string; emptyText?: string },
): void {
  const { doc, pageW, margin, pageBottom } = pd
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(BLACK)
  doc.text(o.heading ?? 'Words', margin, o.startY)

  const colW = (pageW - 2 * margin) / o.cols
  let remaining = o.rows
  let top = o.startY + 12
  if (!remaining.length) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
    doc.text(o.emptyText ?? 'No words yet.', margin, top + 4)
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
    if (remaining.length) {
      doc.addPage()
      top = margin
    }
  }
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
