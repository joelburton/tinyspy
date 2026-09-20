// cs-blessed-pdf

import { jsPDF } from 'jspdf'
import type { SetupRow } from '../setup-form/setupRows'

export type { SetupRow }

// The frame every printer opens with: the shade palette, the document and its
// geometry, the `Brand: title` header, the Setup recap, text fitting, the save.
// A printer composes these with its own board renderer and one of the body
// families (see doc.md).

// ── The print shade system. 0 = black … 255 = white (jsPDF's single-arg gray).
//    Everything not EXPLICITLY colored is one of these three. See doc.md → Shades. ──
export const BLACK = 0 // all text / data / headings — the default
export const DARK_GRAY = 70 // real-but-secondary marks — board grids + column-header labels
export const MEDIUM_GRAY = 180 // minor lines only — turn-row dividers + a table's header rule

/** The header fields every print model carries; each game's model extends this. */
export type PrintHeader = {
  // The gametype BRAND ("RackAttack", "MothCubes") — never the codename.
  brand: string
  // This game instance's title (`common.games.title`, via `GamePageCtx.title`).
  gameTitle: string
  // Formatted date, shown small at the top-right.
  date: string
  // One-line game-state summary under the title (matches the on-screen status).
  summary: string
  // Every setup option, timer included — the same array the game's info column
  // renders (`lib/setupSummary.ts`), so paper and screen agree. Why every
  // option: doc.md → Details.
  setup: SetupRow[]
  // Carried by the Setup heading (`Setup: Co-op`), not by a row. Required so
  // that no printer forgets it — a bare "Setup" looks fine and says nothing.
  mode: 'coop' | 'compete'
}

/** A fresh document plus its cached page geometry — threaded through the helpers. */
export type PrintDoc = {
  doc: jsPDF
  pageW: number
  pageH: number
  margin: number
  // The y past which content must wrap to the next column or page (`pageH - margin`).
  pageBottom: number
  // The y where a body starts: below the header `drawHeader` draws (`margin + HEADER_H`).
  contentTop: number
}

// The header's height: its summary line sits at +24, and the body starts a
// little under it. Every body family reads it through `PrintDoc.contentTop`.
const HEADER_H = 44

// The Setup recap's line height — the heading, then one line per (wrapped) row.
const SETUP_LINE_H = 13

// The page margin — tight, so content uses more of the paper, inside a printer-safe edge.
const MARGIN = 28

/** Create a Letter-size, points-unit document and cache its geometry. */
export function newPrintDoc(): PrintDoc {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  return { doc, pageW, pageH, margin: MARGIN, pageBottom: pageH - MARGIN, contentTop: MARGIN + HEADER_H }
}

/** The height `drawSetup` takes for `lines` lines (see `setupLineCount`) —
 *  for a caller that has to know whether the block fits before drawing it. */
export function setupBlockHeight(lines: number): number {
  return SETUP_LINE_H * lines
}

/** The lines `drawSetup` will draw for `items` in `maxW`: the heading, then
 *  each row's wrapped lines. Measures with the fonts `drawSetup` draws with. */
export function setupLineCount(doc: jsPDF, items: SetupRow[], maxW: number): number {
  return 1 + items.reduce((n, it) => n + setupRowLines(doc, it, maxW).length, 0)
}

// One row's value, wrapped to the space left of its label. Sets the label's
// font to measure it and leaves the value's font set, ready to draw.
function setupRowLines(doc: jsPDF, it: SetupRow, maxW: number): string[] {
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
  const labelW = doc.getTextWidth(`${it.label}: `)
  doc.setFont('helvetica', 'normal').setTextColor(BLACK)
  const valueW = maxW - labelW
  return valueW > 0 ? (doc.splitTextToSize(it.value, valueW) as string[]) : [it.value]
}

/** Draw the shared header: `Brand: title` (bold, truncated to clear the date), the
 *  date top-right, and the summary line below. Small ≠ unimportant — the date is
 *  black, not gray (doc.md). */
export function drawHeader(pd: PrintDoc, m: PrintHeader): void {
  const { doc, pageW, margin } = pd
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(BLACK)
  const dateW = doc.getTextWidth(m.date)
  doc.text(m.date, pageW - margin, margin + 6, { align: 'right' })
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(BLACK)
  doc.text(fit(doc, `${m.brand}: ${m.gameTitle}`, pageW - 2 * margin - dateW - 16), margin, margin + 8)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(BLACK)
  doc.text(m.summary, margin, margin + 24)
}

/**
 * Draw the `Setup: <mode>` sub-heading and its `label: value` lines at (x, y),
 * inside `maxW`: a value too long for the space wraps onto further lines,
 * hanging under the value. Returns the y just below the block, so the caller
 * can flow content after it; `setupLineCount` says beforehand how tall that
 * will be. Why a value wraps rather than truncates: doc.md → Details.
 */
export function drawSetup(
  doc: jsPDF,
  items: SetupRow[],
  x: number,
  y: number,
  mode: 'coop' | 'compete',
  maxW: number,
): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK) // smaller sub-heading
  // The mode rides the heading rather than a row — see PrintHeader.mode. The
  // wording matches the app's own mode pills so paper can't invent a third
  // spelling, and the hyphen in "Co-op" is plain ASCII (an en-dash would not
  // survive WinAnsi).
  doc.text(`Setup: ${mode === 'coop' ? 'Co-op' : 'Compete'}`, x, y)
  let cy = y + SETUP_LINE_H
  items.forEach((it) => {
    const lines = setupRowLines(doc, it, maxW) // leaves the value's font set
    doc.setFont('helvetica', 'bold')
    doc.text(`${it.label}: `, x, cy)
    const labelW = doc.getTextWidth(`${it.label}: `)
    doc.setFont('helvetica', 'normal')
    // Values hang off the label, and wrapped lines hang under the value rather
    // than under the label — so a two-line row still reads as one fact.
    lines.forEach((line) => {
      doc.text(line, x + labelW, cy)
      cy += SETUP_LINE_H
    })
  })
  return cy
}

/**
 * Draw the Setup recap as a page-wide block at `y` — under the tracks, in the
 * track family — or at the top of a new page when it will not fit above
 * `pageBottom`. Nothing is drawn for a game with no rows. The block gets the
 * page's width, so a long value wraps.
 */
export function drawSetupBelow(pd: PrintDoc, m: PrintHeader, y: number): void {
  if (!m.setup.length) return
  const width = pd.pageW - 2 * pd.margin
  if (y + setupBlockHeight(setupLineCount(pd.doc, m.setup, width)) > pd.pageBottom) {
    pd.doc.addPage()
    y = pd.margin
  }
  drawSetup(pd.doc, m.setup, pd.margin, y, m.mode, width)
}

/** Save the doc as `<brand>-<title>.pdf`, handing it to the browser as a download.
 *  `fallback` names the file if the title has no filename-safe characters. */
export function savePrint(pd: PrintDoc, m: PrintHeader, fallback: string): void {
  const name = `${m.brand}-${m.gameTitle}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  pd.doc.save(`${name || fallback}.pdf`)
}

/** Truncate `text` with an ellipsis to fit `maxW` at the doc's current font size. */
export function fit(doc: jsPDF, text: string, maxW: number): string {
  if (!text || doc.getTextWidth(text) <= maxW) return text
  let t = text
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}
