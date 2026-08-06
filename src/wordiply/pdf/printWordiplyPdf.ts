import type { jsPDF } from 'jspdf'
import {
  BLACK,
  DARK_GREY,
  MEDIUM_GREY,
  drawHeader,
  newPrintDoc,
  savePrint,
} from '../../common/pdf/frame'
import { drawTurnLog, twoColGeom } from '../../common/pdf/turnLog'
import type { WordiplyPrintModel } from './model'

/**
 * wordiply's print-to-PDF — the **turn-log body family** (docs/pdf.md), composed
 * from the shared helpers: the frame (header / setup / save) plus `drawTurnLog`'s
 * newspaper two-column flow.
 *
 * **The first printer with no board.** scrabble and psychicnum draw a board in
 * the left column and start the log beneath it; wordiply's "board" IS the log —
 * five guess lines with no state of their own — so the log starts at `colTop`
 * and gets the full two columns. `drawTurnLog` needed no change for this; the
 * `startY` parameter already allowed it.
 *
 * What it prints, and what it deliberately doesn't, is decided in
 * [`model.ts`](./model.ts) — in particular wordiply's terminal-only reveal
 * (scores + longest word) has to hold on paper too. This file only draws.
 */

/** Space under the header before the optional reveal / scores blocks. */
const BLOCK_GAP = 16

/** The reveal word's size. Deliberately BELOW the header title's 16: it's the
 *  page's payoff, but the title still names the document, and a 18pt answer
 *  read as shouting next to it. */
const REVEAL_SIZE = 13

/** Generate the PDF and hand it to the browser as a download. */
export function printWordiplyPdf(m: WordiplyPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd
  const { leftX, colW, colTop } = twoColGeom(pd)

  drawHeader(pd, m)

  // Terminal blocks stack above the log, each returning the y to continue from.
  // Mid-game both are absent and the log simply starts at colTop — no reserved
  // space, because unlike the on-screen layout a page has nothing below to shift.
  let y = colTop
  if (m.reveal) y = drawReveal(doc, m, leftX, y)
  if (m.scores.length) y = drawScores(doc, m, leftX, colW, y)

  drawTurnLog(pd, {
    startY: y,
    // The third column's header. "Guess" (not "Move") — wordiply's turn IS a
    // guess, matching the on-screen log's heading.
    moveLabel: 'Guess',
    rows: m.turns,
    setup: m.setup,
    mode: m.mode,
    emptyText: 'No guesses yet.',
  })

  savePrint(pd, m, 'wordiply')
}

/**
 * The terminal reveal: the longest word that was possible. wordiply's headline
 * payoff, and the one thing a player most wants off the screen and onto paper.
 * Printed big, since it's the answer.
 */
function drawReveal(
  doc: jsPDF,
  m: WordiplyPrintModel,
  x: number,
  y: number,
): number {
  if (!m.reveal) return y
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text('Best possible word', x, y)
  const baseline = y + 16
  doc.setFont('helvetica', 'bold').setFontSize(REVEAL_SIZE).setTextColor(BLACK)
  doc.text(m.reveal.word, x, baseline)
  const w = doc.getTextWidth(m.reveal.word)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(DARK_GREY)
  doc.text(`${m.reveal.length} letters`, x + w + 8, baseline)
  // A LARGER gap after the block than inside it (label→word is 16), so the
  // reveal reads as its own thing rather than running into whatever follows.
  return baseline + BLOCK_GAP + 8
}

/**
 * Compete's per-player finals. A small three-column table (player / length score
 * / letters) with the winner marked by a leading `*` and bold — **not** by
 * color, which a mono printer flattens (the same B&W rule psychicnum's board
 * follows). A plain asterisk, because Helvetica has no star glyph and the
 * alternative is drawing one from line segments for no real gain.
 */
function drawScores(
  doc: jsPDF,
  m: WordiplyPrintModel,
  x: number,
  colW: number,
  y: number,
): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text('Final scores', x, y)
  let cy = y + 13

  const scoreX = x + colW * 0.55
  const letterX = x + colW * 0.82
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(DARK_GREY)
  doc.text('Player', x, cy)
  doc.text('Length', scoreX, cy)
  doc.text('Letters', letterX, cy)
  cy += 4
  doc.setLineWidth(0.4).setDrawColor(MEDIUM_GREY).line(x, cy, x + colW, cy)
  cy += 11

  m.scores.forEach((s) => {
    doc.setFont('helvetica', s.won ? 'bold' : 'normal').setFontSize(9).setTextColor(BLACK)
    // The star rides BEFORE the name so the winner is findable by shape alone.
    doc.text(`${s.won ? '* ' : ''}${s.who}`, x, cy)
    doc.text(`${s.lengthScore}%`, scoreX, cy)
    doc.text(String(s.letterCount), letterX, cy)
    cy += 12
  })

  return cy + BLOCK_GAP
}
