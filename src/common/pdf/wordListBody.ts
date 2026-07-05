import { drawSetup, type PrintDoc, type PrintHeader } from './frame'
import { drawWordColumns, type WordRow } from './wordColumns'

/** The knobs the three word-list printers actually vary. Everything else about the
 *  layout (the offsets) is shared and lives below. */
type WordListOpts = {
  /** Column count for the found-words list. boggle/spellingbee use 4; bananagrams,
   *  whose board leaves a wider band below it, uses 6. Default 4. */
  cols?: number
  /** Placeholder shown when there are no word rows (only bananagrams sets one —
   *  an empty grid is a real, printable state there). */
  emptyText?: string
}

/**
 * The shared body layout for the **word-list PDF family** (boggle + spellingbee +
 * bananagrams; the stated template for future word-list printers — see docs/pdf.md →
 * the two body families): a board at the top-left, the Setup block to its right, and
 * the found-words list below both in column-major columns. The layout offsets (the
 * header gap `44`, the setup gutter `26`/`9`, the words gap `24`) live here ONCE
 * instead of being copied into each printer.
 *
 * The per-game differences are the **board** and two small knobs (`cols`, `emptyText`),
 * so the caller passes a `drawBoard(x, y) → { w, h }` that renders its board at (x, y)
 * and returns the board's drawn width + height (so the skeleton can place the Setup to
 * its right and the words below it). The board size may be fixed (boggle's tile grid,
 * spellingbee's honeycomb) or derived from the position (bananagrams sizes to fill the
 * width and clamps to the page height — hence the callback gets `y`). Assumes
 * `drawHeader(pd, m)` has already run.
 */
export function drawWordListBody(
  pd: PrintDoc,
  m: PrintHeader & { words: WordRow[] },
  drawBoard: (x: number, y: number) => { w: number; h: number },
  opts: WordListOpts = {},
): void {
  const { doc, margin } = pd

  // ── Board (top-left), Setup to its right ──
  const boardTop = margin + 44
  const { w, h } = drawBoard(margin, boardTop)
  const boardBottom = boardTop + h
  const setupBottom = drawSetup(doc, m.setup, margin + w + 26, boardTop + 9)

  // ── Words: column-major alphabetical columns, below the board + setup ──
  drawWordColumns(pd, {
    startY: Math.max(boardBottom, setupBottom) + 24,
    cols: opts.cols ?? 4,
    rows: m.words,
    ...(opts.emptyText ? { emptyText: opts.emptyText } : {}),
  })
}
