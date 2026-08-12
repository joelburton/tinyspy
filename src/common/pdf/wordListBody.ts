import { drawSetup, type PrintDoc, type PrintHeader } from './frame'
import { drawWordColumns } from './wordColumns'
import type { WordSection } from './wordSections'

/** The knobs the three word-list printers actually vary. Everything else about the
 *  layout (the offsets) is shared and lives below. */
type WordListOpts = {
  /** Column count for the found-words list. Default 4. */
  cols?: number
  /** Placeholder shown when there are no word rows (only bananagrams sets one —
   *  an empty grid is a real, printable state there). */
  emptyText?: string
}

/**
 * The shared body layout for the **word-list PDF family** (boggle + spellingbee +
 * wordwheel; the stated template for future word-list printers — see docs/pdf.md →
 * the two body families): a board at the top-left, the Setup block to its right, and
 * the found-words list below both in column-major columns. The layout offsets (the
 * header gap `44`, the setup gutter `26`/`9`, the words gap `24`) live here ONCE
 * instead of being copied into each printer.
 *
 * The list is a list of SECTIONS, stacked. Coop passes one (the plain shared
 * list); compete passes one per player, each with its own score, plus a trailing
 * "Not found" block — see `buildWordSections`.
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
  m: PrintHeader & { sections: WordSection[] },
  drawBoard: (x: number, y: number) => { w: number; h: number },
  opts: WordListOpts = {},
): void {
  const { doc, margin } = pd

  // ── Board (top-left), Setup to its right ──
  const boardTop = margin + 44
  const { w, h } = drawBoard(margin, boardTop)
  const boardBottom = boardTop + h
  // Setup sits right of the board and runs to the right margin — pass that
  // width so a long value (MothCubes' whole board on the `Letters` row, a big
  // roster) wraps inside the page instead of off it.
  const setupX = margin + w + 26
  const setupBottom = drawSetup(doc, m.setup, setupX, boardTop + 9, m.mode, pd.pageW - margin - setupX)

  // ── Words: one stacked block per section, below the board + setup ──
  let y = Math.max(boardBottom, setupBottom) + 24
  m.sections.forEach((section) => {
    y =
      drawWordColumns(pd, {
        startY: y,
        cols: opts.cols ?? 4,
        rows: section.words,
        ...(section.who ? { heading: section.who } : {}),
        ...(section.tally ? { subheading: section.tally } : {}),
        ...(opts.emptyText ? { emptyText: opts.emptyText } : {}),
      }) + 20
  })
}
