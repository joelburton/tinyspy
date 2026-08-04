import type { jsPDF } from 'jspdf'
import {
  BLACK,
  DARK_GREY,
  MEDIUM_GREY,
  drawHeader,
  drawSetup,
  fit,
  newPrintDoc,
  savePrint,
} from '../../common/pdf/frame'
import { drawInTracks, type Track } from '../../common/pdf/columns'
import { drawCheck, drawCross } from '../../common/pdf/marks'
import { COLS, ROWS } from '../lib/board'
import type { PrintTrack, PrintTurn, StrandsPrintModel } from './model'

/**
 * strands' print-to-PDF.
 *
 * **One track per board** (`common/pdf/columns`, three to a page): coop's team
 * board is a single column, and compete gets one per player, because there each
 * racer really does have a different board over the same letters — a merged
 * column would file one player's words under another's grid. Same reasoning
 * wordle and waffle print by.
 *
 * ─── Printing a board whose meaning is COLOUR ──────────────
 * On screen a found word is a purple disc-and-line and the spangram is gold. On
 * a mono printer those are one grey, so the encoding moves to **shape**
 * (docs/pdf.md — colour only for meaning, and never as the only carrier):
 *
 *   found theme word   a solid grey line through the letters
 *   the spangram       the same line, drawn HEAVIER — one word, one emphasis
 *   a missed word      a DASHED line, so "we didn't get this" reads instantly
 *                      as a different kind of mark rather than a paler one
 *
 * Letters print black throughout. Circling every found tile would ink most of
 * the page (the hidden words tile the board exactly, so a solved board is
 * entirely covered); the connecting line alone says both which tiles and in
 * what order, which is more than the screen's discs manage on their own.
 *
 * The turn log's verdict glyphs are the vector marks from `common/pdf/marks`
 * for the same reason: jsPDF's core fonts are WinAnsi, so a unicode star or
 * trophy would not render at all.
 */

/** Board geometry, as a fraction of a track's width. */
const LINE_W = 1.1 // a found word's connector
const SPANGRAM_W = 2.4 // the one word that names the theme
const MISSED_DASH: [number, number] = [2.2, 2] // "nobody got this"
const ROW_H = 11 // a printed log row
const MARK_X = 3 // the verdict glyph's column
const WORD_X = 13

/** Generate the PDF and hand it to the browser as a download. */
export function printStrandsPdf(m: StrandsPrintModel): void {
  const pd = newPrintDoc()
  const { doc } = pd

  // The clue rides IN the header's summary rather than on a line of its own.
  // It's already in the game title too, but that gets truncated to clear the
  // date — and a separate line would both duplicate it and collide with the
  // summary, which sits only 20pt above where the tracks begin.
  drawHeader(pd, m)

  const { bottom, left } = drawInTracks(pd, m.tracks, (t, track) => drawTrack(doc, m, t, track))

  if (m.setup.length) drawSetup(doc, m.setup, left, bottom + 18)

  savePrint(pd, m, 'strands')
}

/** One column: who it belongs to, their board, then their log. */
function drawTrack(doc: jsPDF, m: StrandsPrintModel, t: PrintTrack, track: Track): number {
  let y = track.top

  // Heading. Coop has no name to print — the board is the team's — so the
  // column just leads with its summary.
  if (t.who) {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(BLACK)
    doc.text(fit(doc, t.who, track.width), track.x, y)
    y += 12
  }
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(DARK_GREY)
  doc.text(t.summary, track.x, y)
  y += 10

  y = drawBoard(doc, m.board, t, track, y) + 16
  return drawLog(doc, t.turns, track, y)
}

/**
 * The 8×6 letter grid with each found word's path drawn through it.
 *
 * Three passes, and the middle one is the whole trick: **lines, then a white
 * knock-out disc per traced cell, then letters**. Without the disc a connector
 * runs straight through the glyph it's connecting, which on paper is far worse
 * than on screen — print has no colour separation to rescue it. The disc is the
 * mono equivalent of the on-screen coloured disc: same shape doing the same job
 * of giving the letter a clean field to sit in.
 */
function drawBoard(
  doc: jsPDF,
  board: string[],
  t: PrintTrack,
  track: Track,
  top: number,
): number {
  const cell = track.width / COLS
  const cx = (c: number) => track.x + (c + 0.5) * cell
  const cy = (r: number) => top + (r + 0.5) * cell

  // ── Paths first ──
  for (const w of t.words) {
    if (w.coords.length < 2) continue
    doc.setDrawColor(w.missed ? MEDIUM_GREY : DARK_GREY)
    doc.setLineWidth(w.isSpangram ? SPANGRAM_W : LINE_W)
    // A dash pattern is the missed encoding. Reset it after, or every later
    // stroke on the page inherits it — jsPDF's line-dash is document state, not
    // a per-call argument.
    if (w.missed) doc.setLineDashPattern(MISSED_DASH, 0)
    for (let i = 1; i < w.coords.length; i++) {
      const [r0, c0] = w.coords[i - 1]
      const [r1, c1] = w.coords[i]
      doc.line(cx(c0), cy(r0), cx(c1), cy(r1))
    }
    if (w.missed) doc.setLineDashPattern([], 0)
  }
  doc.setLineWidth(0.2)

  // ── Knock out the letters' backgrounds ──
  doc.setFillColor(255, 255, 255)
  for (const w of t.words) {
    for (const [r, c] of w.coords) {
      doc.circle(cx(c), cy(r), cell * 0.3, 'F')
    }
  }

  // ── Letters on top ──
  doc.setFont('helvetica', 'bold').setFontSize(Math.min(11, cell * 0.62)).setTextColor(BLACK)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      doc.text(board[r][c], cx(c), cy(r) + cell * 0.18, { align: 'center' })
    }
  }

  return top + ROWS * cell
}

/** The verdict glyph. Vector marks, not glyphs: jsPDF core fonts are WinAnsi,
 *  so a star or trophy character would simply not render. */
function drawMark(doc: jsPDF, mark: PrintTurn['mark'], x: number, y: number): void {
  const o = { cx: x + 3, cy: y - 2.5, size: 6, color: [DARK_GREY, DARK_GREY, DARK_GREY] as [number, number, number] }
  if (mark === 'no') {
    drawCross(o, doc)
    return
  }
  if (mark === 'ok') {
    drawCheck(o, doc)
    return
  }
  // A find is a filled square, and the spangram a bigger one — the same
  // "one word, more emphasis" ladder the board's heavier line uses, rather than
  // a third unrelated symbol.
  const s = mark === 'best' ? 5.5 : 3.8
  doc.setFillColor(BLACK, BLACK, BLACK)
  doc.rect(o.cx - s / 2, o.cy - s / 2, s, s, 'F')
}

/** The player's submissions, in order, each led by its verdict glyph. */
function drawLog(doc: jsPDF, turns: PrintTurn[], track: Track, top: number): number {
  let y = top

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(BLACK)
  doc.text('Words', track.x, y)
  y += 4
  doc.setDrawColor(MEDIUM_GREY).setLineWidth(0.4)
  doc.line(track.x, y, track.x + track.width, y)
  y += 10

  if (!turns.length) {
    doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(DARK_GREY)
    doc.text('No words yet.', track.x + WORD_X, y)
    return y + ROW_H
  }

  for (const t of turns) {
    drawMark(doc, t.mark, track.x + MARK_X, y)
    doc.setFont('helvetica', t.mark === 'no' ? 'normal' : 'bold').setFontSize(8.5)
    doc.setTextColor(t.mark === 'no' ? DARK_GREY : BLACK)
    const note = t.note ? ` — ${t.note}` : ''
    doc.text(fit(doc, `${t.word}${note}`, track.width - WORD_X), track.x + WORD_X, y)
    y += ROW_H
  }
  return y
}
