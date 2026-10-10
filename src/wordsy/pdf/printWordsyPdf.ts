// cs-unmet

import type { jsPDF } from 'jspdf'
import { BLACK, DARK_GRAY, MEDIUM_GRAY, drawHeader, newPrintDoc, savePrint } from '@/common/pdf/frame'
import { drawEventLog, twoColGeom } from '@/common/pdf/eventLog'
import type { WordsyPrintModel } from './model'

/**
 * wordsy's print-to-PDF — the **event-log body family** (common/pdf/doc.md):
 * the frame, the totals and each round's table above the log, then
 * `drawEventLog`'s two-column flow. What it prints is decided in
 * [`model.ts`](./model.ts); this file only draws.
 */

/** Space under a block before the next. */
const BLOCK_GAP = 16

/** Generate the PDF and hand it to the browser as a download. */
export function printWordsyPdf(m: WordsyPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd
  const { leftX, colW, colTop } = twoColGeom(pd)

  drawHeader(pd, m)

  let y = drawTotals(doc, m, leftX, colW, colTop)
  if (m.tables.length > 0) y = drawTables(doc, m, leftX, y)

  drawEventLog(pd, {
    startY: y,
    heading: 'Words',
    moveLabel: 'Word',
    rows: m.turns,
    setupRows: m.setupRows,
    mode: m.mode,
    emptyText: 'No round finished yet.',
  })

  savePrint(pd, m, 'wordsy')
}

/**
 * Every player's total, highest first, a winner marked by a leading `*` and
 * bold — not by color, which a mono printer flattens.
 */
function drawTotals(doc: jsPDF, m: WordsyPrintModel, x: number, colW: number, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text('Totals', x, y)
  let cy = y + 13
  const totalX = x + colW * 0.7

  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(DARK_GRAY)
  doc.text('Player', x, cy)
  doc.text('Total', totalX, cy)
  cy += 4
  doc.setLineWidth(0.4).setDrawColor(MEDIUM_GRAY).line(x, cy, x + colW, cy)
  cy += 11

  m.totals.forEach((t) => {
    doc.setFont('helvetica', t.won ? 'bold' : 'normal').setFontSize(9).setTextColor(BLACK)
    doc.text(`${t.won ? '* ' : ''}${t.name}`, x, cy)
    doc.text(String(t.total), totalX, cy)
    cy += 12
  })
  return cy + BLOCK_GAP
}

/** Each finished round's eight cards, one line a round. */
function drawTables(doc: jsPDF, m: WordsyPrintModel, x: number, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
  doc.text('Tables', x, y)
  let cy = y + 13
  m.tables.forEach((t) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
    doc.text(`${t.num}`, x, cy)
    doc.text(t.cards, x + 16, cy)
    cy += 12
  })
  return cy + BLOCK_GAP
}
