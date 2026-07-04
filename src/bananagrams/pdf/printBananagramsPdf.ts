import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GREY, drawHeader, drawSetup, newPrintDoc, savePrint, type PrintHeader } from '../../common/pdf/frame'
import { drawWordColumns } from '../../common/pdf/wordColumns'

/**
 * bananagrams's print-to-PDF, composed from the shared `common/pdf` helpers
 * (docs/pdf.md): the frame (header / Setup / save) + `wordColumns` (the found-words
 * list, here every word ON the board). It's the word-list body family — a board
 * top-left, the Setup to its right, the words below — like boggle/spellingbee.
 *
 * The one bananagrams-specific twist is board SIZING. bananagrams builds a crossword
 * of arbitrary shape somewhere in a big 25×25 arena, so unlike boggle (a fixed 4×4 /
 * 6×6 grid at a fixed tile size) the board is handed in ALREADY CROPPED to the used
 * tiles (`boardToGrid`), and the tile size is DERIVED so that used crop fills ~75% of
 * the page width — the board is the star of the page. The words carry no score or
 * finder (a Bananagrams board isn't "found" by anyone — it's one player's grid), so
 * every row is a bare word (`found: null`).
 */

/** The print payload — plain data, built by the caller from the live board. */
export type BananagramsPrintModel = PrintHeader & {
  /** The used part of the board, row-major + cropped to the tiles (`boardToGrid`):
   *  each cell an UPPERCASE letter, or `''` for a gap inside the crossword. */
  board: string[][]
  /** Every word on the board, de-duped + alphabetical (bare — no score/finder). */
  words: string[]
}

const TILE_BORDER_W = 0.8 // board-tile border weight (matches boggle's grid)
// The used board fills this fraction of the content width — the print's headline
// element. A clamp keeps a tiny board (a near-empty grid) from ballooning into
// giant tiles, and the page-height clamp keeps a tall board on the page.
const BOARD_WIDTH_FRAC = 0.75
// The max tile size = the size at which MAX_TILES_ACROSS tiles would just fill the
// 75% width. So a board narrower than that renders at THIS size (never bigger), and a
// board that wide (or wider) fills the 75% naturally. Derived, not a magic number, so
// it's easy to tune once we see how 24-across looks in print.
const MAX_TILES_ACROSS = 24

/** Generate the PDF and hand it to the browser as a download. */
export function printBananagramsPdf(m: BananagramsPrintModel): void {
  const pd = newPrintDoc()
  const { doc, pageW, margin, pageBottom } = pd

  drawHeader(pd, m)

  // ── Board (sized to fill ~75% width), Setup to its right ──
  const boardTop = margin + 44
  const rows = m.board.length
  const cols = rows ? m.board[0].length : 0
  const contentW = pageW - 2 * margin

  // Tile size is WIDTH-driven — the used crop fills BOARD_WIDTH_FRAC of the content
  // width — but clamped two ways: never taller than the page (a narrow-but-tall
  // board), and never bigger than `maxTile` (the MAX_TILES_ACROSS size, so a small
  // board doesn't balloon).
  const boardW75 = contentW * BOARD_WIDTH_FRAC
  const maxTile = boardW75 / MAX_TILES_ACROSS
  const byWidth = cols ? boardW75 / cols : maxTile
  const byHeight = rows ? (pageBottom - boardTop) / rows : maxTile
  const tile = Math.min(byWidth, byHeight, maxTile)

  drawBoard(doc, m.board, margin, boardTop, tile)
  const boardW = cols * tile
  const boardBottom = boardTop + rows * tile
  // Setup sits in the space to the right of the board (the ~25% the board leaves).
  const setupBottom = drawSetup(doc, m.setup, margin + boardW + 26, boardTop + 9)

  // ── Words: 6 balanced column-major alphabetical columns, below board + setup ──
  drawWordColumns(pd, {
    startY: Math.max(boardBottom, setupBottom) + 24,
    cols: 6,
    rows: m.words.map((w) => ({ word: w, found: null })),
    emptyText: 'No words yet — the board is empty.',
  })

  savePrint(pd, m, 'bananagrams')
}

/** Draw the cropped board at (x0, y0), `tile` pt per cell — white tiles, dark-grey
 *  border, black letter centered. A `''` cell is a gap in the crossword: left blank
 *  (no border), so the grid reads as the interlocking word shape it is. */
function drawBoard(doc: jsPDF, grid: string[][], x0: number, y0: number, tile: number): void {
  const fs = tile * 0.5
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const face = grid[y][x]
      if (!face) continue // a gap between words — leave it white/empty
      const px = x0 + x * tile
      const py = y0 + y * tile
      doc.setLineWidth(TILE_BORDER_W).setDrawColor(DARK_GREY).rect(px, py, tile, tile, 'S')
      doc.setFont('helvetica', 'bold').setFontSize(fs).setTextColor(BLACK)
      doc.text(face, px + tile / 2, py + tile / 2 + fs * 0.35, { align: 'center' })
    }
  }
}
