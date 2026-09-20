// cs-blessed-pdf

import { drawSetup, type PrintDoc, type PrintHeader } from './frame'
import { drawWordColumns } from './wordColumns'
import type { WordSection } from './wordSections'

/** The one knob a word-list printer may vary; the layout itself is shared. */
type WordListOpts = {
  // Column count for the word list. Default 4.
  cols?: number
}

/**
 * The body layout for the word-list family: the board at the top-left, the
 * Setup recap to its right, and the word list below both — one stacked block
 * per section (see `buildWordSections`). The offsets live here rather than in
 * each printer.
 *
 * The caller passes `drawBoard(x, y) → { w, h }`, which renders its board at
 * (x, y) and returns the drawn size, so the Setup can sit to the board's right
 * and the words below it. Assumes `drawHeader(pd, m)` has already run.
 */
export function drawWordListBody(
  pd: PrintDoc,
  m: PrintHeader & { sections: WordSection[] },
  drawBoard: (x: number, y: number) => { w: number; h: number },
  opts: WordListOpts = {},
): void {
  const { doc, margin } = pd

  // ── Board (top-left), Setup to its right ──
  const boardTop = pd.contentTop
  const { w, h } = drawBoard(margin, boardTop)
  const boardBottom = boardTop + h
  // Setup sits right of the board and runs to the right margin — pass that
  // width so a long value (boggle's whole board on the `Letters` row, a big
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
      }) + 20
  })
}
