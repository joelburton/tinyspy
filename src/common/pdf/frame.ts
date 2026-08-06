import { jsPDF } from 'jspdf'
import type { SetupRow } from '../lib/game/setupRows'

export type { SetupRow }

/**
 * The shared frame for every game's print-to-PDF (see docs/pdf.md). These are the
 * à-la-carte primitives common to ALL printable games — the shade palette, the
 * document + page geometry, the `Brand: title` header, the "Setup" block, text
 * fitting, and the save. A game's `print<Game>Pdf` composes these with its OWN board
 * renderer + body (a turn log via `turnLog.ts`, or a word list via `wordColumns.ts`).
 *
 * Deliberately a toolkit, not a template: the games' body layouts differ too much
 * (a 2-column newspaper turn flow vs. a board + side-setup + word columns) to share a
 * single render() with callbacks — so the frame owns only the truly-common atoms and
 * each game stays in control of composition.
 */

// ── The print shade system. 0 = black … 255 = white (jsPDF's single-arg grey).
//    Everything not EXPLICITLY colored is one of these three. See docs/pdf.md. ──
export const BLACK = 0 // all text / data / headings — the default
export const DARK_GREY = 70 // real-but-secondary marks — board grids + column-header labels
export const MEDIUM_GREY = 180 // minor lines only — turn-row dividers + a table's header rule

/** The header/footer fields every print model carries (each game's model extends this). */
export type PrintHeader = {
  /** The gametype BRAND ("RackAttack", "MothCubes") — never the code-name. */
  brand: string
  /** This game instance's title (`common.games.title`, via `GamePageCtx.title`). */
  gameTitle: string
  /** Formatted date, shown small at the top-right. */
  date: string
  /** One-line game-state summary under the title (matches the on-screen status). */
  summary: string
  /** EVERY setup option (label + value), timer included — a printout is a record, and
   *  one that omits the constraints misreports the achievement (docs/pdf.md → Setup
   *  rows). This reverses an earlier rule that printed "the relevant options only".
   *
   *  Comes from the game's `lib/setupSummary.ts`, the SAME array its info column
   *  renders, so paper and screen can't drift. Every game has one except crosswords,
   *  which has no Setup block on either surface (docs/pdf.md → Setup rows). */
  setup: SetupRow[]
  /** Co-op or compete, which the Setup heading carries (`Setup: Co-op`) rather than
   *  spending a row on — mode is locked at the GAMETYPE level (`manifest.mode`) and is
   *  never a control on the setup form, so it frames the block instead of sitting in
   *  it. REQUIRED, deliberately: as an optional argument the fifteenth game forgets it
   *  and quietly prints a bare "Setup" that looks perfectly fine. The screen doesn't
   *  repeat the mode (its header and the club listing already say it); a PDF has no
   *  chrome, so it must carry its own framing. */
  mode: 'coop' | 'compete'
}

/** A fresh document plus its cached page geometry — threaded through the helpers. */
export type PrintDoc = {
  doc: jsPDF
  pageW: number
  pageH: number
  /** Page margin (tight-ish so content uses more of the paper, safe for print). */
  margin: number
  /** The y past which content must wrap to the next column/page (`pageH - margin`). */
  pageBottom: number
}

/** Create a Letter-size, points-unit document and cache its geometry. */
export function newPrintDoc(margin = 28): PrintDoc {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  return { doc, pageW, pageH, margin, pageBottom: pageH - margin }
}

/** Draw the shared header: `Brand: title` (bold, truncated to clear the date), the
 *  date top-right, and the summary line below. Small ≠ unimportant — the date is
 *  black, not grey (docs/pdf.md). */
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

/** Draw a "Setup" sub-heading + its `label: value` lines at (x, y). Returns the y just
 *  below the block, so the caller can flow content after it (or measure its height). */
export function drawSetup(
  doc: jsPDF,
  items: SetupRow[],
  x: number,
  y: number,
  mode: 'coop' | 'compete',
): number {
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK) // smaller sub-heading
  // The mode rides the heading rather than a row — see PrintHeader.mode. The
  // wording matches the app's own mode pills so paper can't invent a third
  // spelling, and the hyphen in "Co-op" is plain ASCII (an en-dash would not
  // survive WinAnsi).
  doc.text(`Setup: ${mode === 'coop' ? 'Co-op' : 'Compete'}`, x, y)
  let cy = y + 13
  items.forEach((it) => {
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
    doc.text(`${it.label}: `, x, cy)
    const labelW = doc.getTextWidth(`${it.label}: `)
    doc.setFont('helvetica', 'normal').setTextColor(BLACK)
    doc.text(it.value, x + labelW, cy)
    cy += 13
  })
  return cy
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
