import { jsPDF } from 'jspdf'

/**
 * ⚠️ SPIKE (the 3rd printable game — boggle — so we learn what's truly common before
 * extracting a `common/` print scaffold). Follows docs/pdf.md: the three-shade palette,
 * black data, white backgrounds, the Brand:title + date header.
 *
 * boggle's layout is DIFFERENT from scrabble/psychicnum's 2-column newspaper flow, on
 * purpose (a data point for the shared scaffold): a **fixed-size** board top-left (so a
 * 6×6 board prints bigger than a 4×4 — it isn't scaled to a column), the **Setup** to the
 * RIGHT of the board, and below them the found words in **6 column-major, alphabetical
 * columns** — each row: the word (+ a bonus dot) · +score · finder (right-justified).
 *
 * NOTE: still duplicates the header / `fit` / `slug` from the other two spikes — the
 * seam to lift into `common/` once these conventions have settled across 3 games.
 */

/** The print payload — plain data built by the caller from the live game state. */
export type BogglePrintModel = {
  brand: string
  gameTitle: string
  date: string
  summary: string
  /** The board as a grid of display faces (`boardToDisplay` — 'A', 'Qu', '?', …). */
  board: string[][]
  /** Relevant setup options (label + value) — dice set, bands, min length, scoring. */
  setup: { label: string; value: string }[]
  /** The word list, ALREADY sorted alphabetically. A found word carries its score +
   *  finder; a `found: null` entry is a required word that was MISSED — shown (at
   *  terminal only) as the bare word, no score, no finder. */
  words: { word: string; bonus: boolean; found: { points: number; who: string } | null }[]
}

// ── The print shade system (docs/pdf.md). 0 = black … 255 = white. ──
const BLACK = 0 // text / data / headings
const DARK_GREY = 70 // the board tiles' grid
// (no MEDIUM_GREY here — boggle's word list has no divider rules, unlike the turn tables)
const TILE = 26 // fixed board-tile size (= scrabble's rack-tile size — a starting point)
const TILE_BORDER_W = 0.8 // board-tile border weight
const COLS = 4 // word-list columns — wide enough for a long word + score + finder name
const ROW_H = 11 // word-list row height
const COL_GUTTER = 12 // gap between word columns (so a finder never touches the next word)

/** Generate the PDF and hand it to the browser as a download. */
export function printBogglePdf(m: BogglePrintModel): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 28
  const pageBottom = pageH - margin

  // ── Header: "Brand: game title" left, date top-right, summary below ──
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
  const dateW = doc.getTextWidth(m.date)
  doc.text(m.date, pageW - margin, margin + 6, { align: 'right' })
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(BLACK)
  doc.text(fit(doc, `${m.brand}: ${m.gameTitle}`, pageW - 2 * margin - dateW - 16), margin, margin + 8)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(BLACK)
  doc.text(m.summary, margin, margin + 24)

  // ── Board (fixed tile size, top-left) ──
  const boardTop = margin + 44
  const n = m.board.length
  drawBoard(doc, m.board, margin, boardTop)
  const boardBottom = boardTop + n * TILE
  const boardRight = margin + n * TILE

  // ── Setup (to the RIGHT of the board) ──
  const setupX = boardRight + 26
  let sy = boardTop + 9
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text('Setup', setupX, sy)
  sy += 14
  m.setup.forEach((it) => {
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
    doc.text(`${it.label}: `, setupX, sy)
    const labelW = doc.getTextWidth(`${it.label}: `)
    doc.setFont('helvetica', 'normal')
    doc.text(it.value, setupX + labelW, sy)
    sy += 13
  })
  const setupBottom = sy

  // ── Words (6 column-major alphabetical columns, below the board + setup) ──
  const headY = Math.max(boardBottom, setupBottom) + 24
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(BLACK)
  doc.text('Words', margin, headY)

  const colW = (pageW - 2 * margin) / COLS
  let remaining = m.words
  let top = headY + 12
  if (!remaining.length) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
    doc.text('No words yet.', margin, top + 4)
  }
  while (remaining.length) {
    // Balance the words ACROSS all 6 columns (ceil(n / 6) rows) rather than filling
    // column 1 to the page bottom first — a compact block, not one tall column. Only
    // when even the balanced height overflows the page do we cap + spill to page 2.
    const fitRows = Math.max(1, Math.floor((pageBottom - top) / ROW_H))
    const rowsPerCol = Math.min(fitRows, Math.ceil(remaining.length / COLS))
    const perPage = COLS * rowsPerCol
    remaining.slice(0, perPage).forEach((w, i) => {
      const c = Math.floor(i / rowsPerCol)
      const r = i % rowsPerCol
      drawWordRow(doc, w, margin + c * colW, top + r * ROW_H, colW)
    })
    remaining = remaining.slice(perPage)
    if (remaining.length) {
      doc.addPage()
      top = margin
    }
  }

  doc.save(`${slug(`${m.brand}-${m.gameTitle}`)}.pdf`)
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

/** One word-list cell: word (+ bonus dot) left, and — for a FOUND word — +score and
 *  finder right-justified. A missed word (`found: null`, terminal reveal) is the bare
 *  word alone; the absence of a score/finder is what marks it as unfound. */
function drawWordRow(doc: jsPDF, w: BogglePrintModel['words'][number], x: number, ry: number, colW: number): void {
  const right = x + colW - COL_GUTTER
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(BLACK)
  // The word may run all the way to the column's right edge — unless a found word's
  // score + finder claim the right side, which shrinks the space left for it.
  let wordMaxW = right - x - (w.bonus ? 6 : 0)
  if (w.found) {
    const who = fit(doc, w.found.who, colW * 0.42)
    doc.text(who, right, ry, { align: 'right' })
    const scoreStr = `+${w.found.points}`
    const scoreRight = right - doc.getTextWidth(who) - 5
    doc.text(scoreStr, scoreRight, ry, { align: 'right' })
    wordMaxW = scoreRight - doc.getTextWidth(scoreStr) - 6 - (w.bonus ? 6 : 0) - x
  }
  const word = fit(doc, w.word, Math.max(6, wordMaxW))
  doc.text(word, x, ry)
  if (w.bonus) {
    doc.setFillColor(BLACK, BLACK, BLACK).circle(x + doc.getTextWidth(word) + 3, ry - 2.2, 1.3, 'F')
  }
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
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'boggle'
}
