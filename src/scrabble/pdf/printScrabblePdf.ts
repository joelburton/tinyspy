import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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
 * ⚠️ SPIKE / POC (branch `scrabble-jspdf`). A throwaway proof-of-concept to see
 * what the jsPDF code shape looks like for printing a scrabble board — to compare
 * against a react-pdf spike before we pick a direction and build the real,
 * shared-across-games version. Deliberately self-contained and un-abstracted: no
 * common/ scaffold, no pagination polish, no font embedding. It reuses the pure
 * board logic (premiumAt / LETTER_VALUES / …) but draws its own print-tuned board
 * rather than the on-screen `<Board>` (CSS-modules + pointer handlers, print-hostile).
 *
 * jsPDF is **imperative**: you position and draw every primitive yourself (`rect`,
 * `text`, `circle`) in page points. That's a natural fit for a fixed grid (a double
 * loop over 225 cells) but means the moves table + rack + pagination are all
 * hand-placed — hence `jspdf-autotable` for the one genuinely tabular part (it
 * paginates a long move list for free).
 */

/** The print payload — plain data (strings + the board array), built by the caller
 *  from the live game state, so this module knows nothing about the game hooks. */
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

/** Generate the PDF and hand it to the browser as a download. */
export function printScrabblePdf(m: ScrabblePrintModel): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 40

  // ── Header ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20)
  doc.text(m.title, margin, margin + 4)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90)
  doc.text(m.summary, margin, margin + 22)

  // ── Board: a 15×15 grid drawn cell-by-cell ──────────────
  const boardTop = margin + 42
  const cell = 26
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const px = margin + x * cell
      const py = boardTop + y * cell
      const idx = cellIndex(x, y)
      const placed = m.board[idx]

      if (placed) {
        // A committed tile: tan face, big letter + a small corner value.
        doc.setFillColor(...TILE_FILL).setDrawColor(140)
        doc.rect(px, py, cell, cell, 'FD')
        doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20)
        doc.text(placed.l, px + cell / 2, py + cell / 2 + 4, { align: 'center' })
        const value = placed.b ? 0 : (LETTER_VALUES[placed.l] ?? 0)
        doc.setFont('helvetica', 'normal').setFontSize(6)
        doc.text(String(value), px + cell - 3, py + cell - 3, { align: 'right' })
      } else {
        // An empty square: premium fill + label (or the center star).
        const st = PREMIUM_STYLE[premiumAt(x, y)]
        doc.setFillColor(...st.fill).setDrawColor(200)
        doc.rect(px, py, cell, cell, 'FD')
        if (idx === CENTER) {
          doc.setFillColor(150, 150, 150).circle(px + cell / 2, py + cell / 2, 4, 'F')
        } else if (st.label) {
          doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(70)
          doc.text(st.label, px + cell / 2, py + cell / 2 + 3, { align: 'center' })
        }
      }
    }
  }

  // ── Rack (below the board) ──────────────────────────────
  const boardBottom = boardTop + cell * BOARD_SIZE
  let y = boardBottom + 26
  if (m.rackLabel && m.rack.length) {
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20)
    doc.text(m.rackLabel, margin, y)
    y += 8
    const rt = 30
    m.rack.forEach((letter, i) => {
      const px = margin + i * (rt + 6)
      doc.setFillColor(...TILE_FILL).setDrawColor(140)
      doc.rect(px, y, rt, rt, 'FD')
      if (letter !== '?') {
        doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(20)
        doc.text(letter, px + rt / 2, y + rt / 2 + 5, { align: 'center' })
        doc.setFont('helvetica', 'normal').setFontSize(7)
        doc.text(String(LETTER_VALUES[letter] ?? 0), px + rt - 3, y + rt - 3, { align: 'right' })
      }
    })
    y += rt + 26
  }

  // ── Moves (autoTable handles the table + pagination) ────
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Player', 'Move']],
    body: m.moves.length
      ? m.moves.map((mv) => [String(mv.seq), mv.who, mv.text])
      : [['—', '', 'No moves yet.']],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [55, 55, 55] },
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 100 } },
  })

  doc.save(`${slug(m.title)}.pdf`)
}

/** A filesystem-safe filename from the title. */
function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'scrabble'
}
